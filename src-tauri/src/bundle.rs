//! Standalone `.app` bundles: a mini app installed as its own macOS app
//! ("Add to Applications"), with its own Dock icon, name and bundle id.
//!
//! A bundle is a copy of this binary plus a `Contents/Resources/solo.json`
//! marker. When the binary starts and finds that marker next to it, it runs in
//! solo mode (`solo.rs`): one window, one app, no desktop.
//!
//! ```text
//! ~/Applications/Nonla Apps/<Name>.app/Contents/
//!   MacOS/nonladesk              copy of the running binary
//!   Resources/solo.json          {"id", "nonlaVersion"}
//!   Resources/icon.icns          drawn from the app's icon.svg
//!   Resources/sandbox-runner.cjs
//!   Info.plist
//! ```

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::{json, Value};
use tauri::AppHandle;

use crate::miniapp::{self, MiniApp};
use crate::{backend, paths};

const FALLBACK_ICNS: &[u8] = include_bytes!("../icons/icon.icns");

/// Where the bundles go. Debug builds use their own folder.
pub fn install_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join("Applications")
        .join(if paths::IS_DEV {
            "Nonla Apps Dev"
        } else {
            "Nonla Apps"
        })
}

fn bundle_id(id: &str) -> String {
    format!("{}.app.{id}", paths::BUNDLE_ID)
}

fn solo_json(bundle: &Path) -> Option<Value> {
    let text = fs::read_to_string(bundle.join("Contents/Resources/solo.json")).ok()?;
    serde_json::from_str(&text).ok()
}

/// Every installed bundle as (app id, path, Nonla Desk version it was built by).
fn installed() -> Vec<(String, PathBuf, String)> {
    let Ok(entries) = fs::read_dir(install_dir()) else {
        return vec![];
    };
    entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "app"))
        .filter_map(|p| {
            let v = solo_json(&p)?;
            let id = v["id"].as_str()?.to_string();
            let version = v["nonlaVersion"].as_str().unwrap_or_default().to_string();
            Some((id, p, version))
        })
        .collect()
}

pub fn installed_ids() -> std::collections::HashSet<String> {
    installed().into_iter().map(|(id, _, _)| id).collect()
}

pub fn find_installed(id: &str) -> Option<PathBuf> {
    installed()
        .into_iter()
        .find(|(i, _, _)| i == id)
        .map(|(_, p, _)| p)
}

fn file_stem(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '/' | ':' | '\\' | '\0' => '-',
            c if c.is_control() => ' ',
            c => c,
        })
        .collect();
    let cleaned = cleaned.trim().trim_start_matches('.').trim();
    if cleaned.is_empty() {
        "Mini App".into()
    } else {
        cleaned.chars().take(60).collect()
    }
}

fn xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn info_plist(rec: &MiniApp, exe_name: &str) -> String {
    let name = xml(&rec.name);
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleExecutable</key><string>{exe}</string>
  <key>CFBundleIdentifier</key><string>{bundle_id}</string>
  <key>CFBundleName</key><string>{name}</string>
  <key>CFBundleDisplayName</key><string>{name}</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>{version}</string>
  <key>CFBundleVersion</key><string>{version}</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.developer-tools</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSSupportsAutomaticGraphicsSwitching</key><true/>
  <key>NSCameraUsageDescription</key><string>{name} may ask to use the camera.</string>
  <key>NSMicrophoneUsageDescription</key><string>{name} may ask to use the microphone.</string>
</dict>
</plist>
"#,
        exe = xml(exe_name),
        bundle_id = xml(&bundle_id(&rec.id)),
        version = xml(if rec.version.is_empty() {
            "1.0.0"
        } else {
            &rec.version
        }),
    )
}

// ─── Install ─────────────────────────────────────────────────────────────────

/// Create or refresh the bundle for `id`. Returns its path.
pub fn install(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    let rec = miniapp::require(id)?;
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_name = exe
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "nonladesk".into());

    let dir = install_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;

    let target = find_installed(id).unwrap_or_else(|| {
        let stem = file_stem(&rec.name);
        let plain = dir.join(format!("{stem}.app"));
        if plain.exists() {
            dir.join(format!("{stem} ({}).app", &id[..id.len().min(6)]))
        } else {
            plain
        }
    });

    // Build next to the target, then swap, so a running copy keeps its old files.
    let staging = dir.join(format!(".staging-{id}.app"));
    let _ = fs::remove_dir_all(&staging);
    let macos = staging.join("Contents/MacOS");
    let resources = staging.join("Contents/Resources");
    fs::create_dir_all(&macos).map_err(|e| e.to_string())?;
    fs::create_dir_all(&resources).map_err(|e| e.to_string())?;

    let built = (|| -> Result<(), String> {
        fs::copy(&exe, macos.join(&exe_name)).map_err(|e| format!("copy binary: {e}"))?;
        let runner = backend::runner_path(app);
        fs::copy(&runner, resources.join("sandbox-runner.cjs"))
            .map_err(|e| format!("copy {}: {e}", runner.display()))?;
        fs::write(
            resources.join("solo.json"),
            json!({ "id": id, "nonlaVersion": app.package_info().version.to_string() }).to_string(),
        )
        .map_err(|e| e.to_string())?;
        fs::write(resources.join("icon.icns"), make_icns(id)).map_err(|e| e.to_string())?;
        fs::write(
            staging.join("Contents/Info.plist"),
            info_plist(&rec, &exe_name),
        )
        .map_err(|e| e.to_string())?;
        sign(&staging)
    })();
    if let Err(e) = built {
        let _ = fs::remove_dir_all(&staging);
        return Err(e);
    }

    if target.exists() {
        fs::remove_dir_all(&target).map_err(|e| format!("{}: {e}", target.display()))?;
    }
    fs::rename(&staging, &target).map_err(|e| format!("{}: {e}", target.display()))?;
    // Make Finder and the Dock pick up the icon.
    let _ = Command::new("touch").arg(&target).status();
    Ok(target)
}

/// Ad-hoc signature: a copied binary must be signed again to run from its new bundle.
fn sign(bundle: &Path) -> Result<(), String> {
    let out = Command::new("codesign")
        .args(["--force", "--deep", "--sign", "-"])
        .arg(bundle)
        .output()
        .map_err(|e| format!("codesign: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(format!(
            "codesign failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ))
    }
}

/// Remove the bundle. Returns its old path when there was one.
pub fn uninstall(id: &str) -> Result<Option<PathBuf>, String> {
    let Some(path) = find_installed(id) else {
        return Ok(None);
    };
    fs::remove_dir_all(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    Ok(Some(path))
}

/// Rebuild the bundle for `id` if one is installed (name, icon or version changed).
pub fn refresh(app: &AppHandle, id: &str) {
    if find_installed(id).is_some() {
        if let Err(e) = install(app, id) {
            eprintln!("[bundle] refresh {id}: {e}");
        }
    }
}

/// After an update of Nonla Desk, rebuild bundles made by an older version so
/// they run the new code. Drops bundles of apps that no longer exist.
pub fn refresh_outdated(app: &AppHandle) {
    let current = app.package_info().version.to_string();
    for (id, path, version) in installed() {
        if miniapp::get(&id).ok().flatten().is_none() {
            let _ = fs::remove_dir_all(&path);
        } else if version != current {
            refresh(app, &id);
        }
    }
}

pub fn open(id: &str) -> Result<(), String> {
    let path = find_installed(id).ok_or("This app is not installed as a standalone app")?;
    Command::new("open")
        .arg(&path)
        .status()
        .map_err(|e| e.to_string())
        .and_then(|s| {
            if s.success() {
                Ok(())
            } else {
                Err(format!("open {} failed", path.display()))
            }
        })
}

// ─── Icon ────────────────────────────────────────────────────────────────────

const CANVAS: u32 = 1024;
/// Apple's icon grid: the shape fills 824 of 1024 px, the rest is margin.
const TILE: f32 = 824.0;

/// The app's icon for the menu bar: 44px RGBA (22pt at 2x). None without a usable icon.svg.
pub fn tray_icon(id: &str) -> Option<tauri::image::Image<'static>> {
    use resvg::tiny_skia::{FilterQuality, Pixmap, PixmapPaint, Transform};

    let base = render_icon(&miniapp::read_icon_svg(id)?).ok()?;
    const SIZE: u32 = 44;
    // Crop the 100px margin of the 1024px canvas.
    let scale = SIZE as f32 / TILE;
    let margin = (CANVAS as f32 - TILE) / 2.0;
    let mut small = Pixmap::new(SIZE, SIZE)?;
    small.draw_pixmap(
        0,
        0,
        base.as_ref(),
        &PixmapPaint {
            quality: FilterQuality::Bicubic,
            ..Default::default()
        },
        Transform::from_row(scale, 0.0, 0.0, scale, -margin * scale, -margin * scale),
        None,
    );
    let mut rgba = Vec::with_capacity((SIZE * SIZE * 4) as usize);
    for p in small.pixels() {
        let c = p.demultiply();
        rgba.extend_from_slice(&[c.red(), c.green(), c.blue(), c.alpha()]);
    }
    Some(tauri::image::Image::new_owned(rgba, SIZE, SIZE))
}

fn make_icns(id: &str) -> Vec<u8> {
    let Some(svg) = miniapp::read_icon_svg(id) else {
        return FALLBACK_ICNS.to_vec();
    };
    match render_icon(&svg) {
        Ok(base) => encode_icns(&base),
        Err(e) => {
            eprintln!("[bundle] icon of {id}: {e}");
            FALLBACK_ICNS.to_vec()
        }
    }
}

/// Draw `svg` as a 1024px macOS icon. Icons that already are a filled tile
/// (the house style) are used as they are; line icons go on a white tile.
fn render_icon(svg: &str) -> Result<resvg::tiny_skia::Pixmap, String> {
    use resvg::tiny_skia::{Pixmap, PixmapPaint, Transform};

    let svg = svg.replace("currentColor", "#1d1d1d");
    let tree = resvg::usvg::Tree::from_str(&svg, &resvg::usvg::Options::default())
        .map_err(|e| e.to_string())?;

    let draw = |size: f32| -> Result<Pixmap, String> {
        let side = size.round() as u32;
        let mut pm = Pixmap::new(side, side).ok_or("bad icon size")?;
        let s = tree.size();
        let scale = size / s.width().max(s.height());
        let tx = (size - s.width() * scale) / 2.0;
        let ty = (size - s.height() * scale) / 2.0;
        resvg::render(
            &tree,
            Transform::from_scale(scale, scale).post_translate(tx, ty),
            &mut pm.as_mut(),
        );
        Ok(pm)
    };

    let flat = draw(TILE)?;
    let covered = flat.pixels().iter().filter(|p| p.alpha() > 8).count() as f32;
    let filled_tile = covered / (flat.width() * flat.height()) as f32 > 0.55;

    let mut canvas = Pixmap::new(CANVAS, CANVAS).ok_or("bad icon size")?;
    let origin = (CANVAS as f32 - TILE) / 2.0;
    if filled_tile {
        canvas.draw_pixmap(
            origin as i32,
            origin as i32,
            flat.as_ref(),
            &PixmapPaint::default(),
            Transform::identity(),
            None,
        );
    } else {
        fill_squircle(&mut canvas, origin, TILE);
        let glyph = draw(TILE * 0.58)?;
        let at = ((CANVAS as f32 - glyph.width() as f32) / 2.0) as i32;
        canvas.draw_pixmap(
            at,
            at,
            glyph.as_ref(),
            &PixmapPaint::default(),
            Transform::identity(),
            None,
        );
    }
    Ok(canvas)
}

fn fill_squircle(canvas: &mut resvg::tiny_skia::Pixmap, origin: f32, size: f32) {
    use resvg::tiny_skia::{Color, FillRule, Paint, PathBuilder, Transform};

    let (x, y, r) = (origin, origin, size * 0.225);
    let k = r * 0.5523;
    let (x2, y2) = (x + size, y + size);
    let mut pb = PathBuilder::new();
    pb.move_to(x + r, y);
    pb.line_to(x2 - r, y);
    pb.cubic_to(x2 - r + k, y, x2, y + r - k, x2, y + r);
    pb.line_to(x2, y2 - r);
    pb.cubic_to(x2, y2 - r + k, x2 - r + k, y2, x2 - r, y2);
    pb.line_to(x + r, y2);
    pb.cubic_to(x + r - k, y2, x, y2 - r + k, x, y2 - r);
    pb.line_to(x, y + r);
    pb.cubic_to(x, y + r - k, x + r - k, y, x + r, y);
    pb.close();
    let Some(path) = pb.finish() else { return };
    let mut paint = Paint::default();
    paint.set_color(Color::from_rgba8(255, 255, 255, 255));
    paint.anti_alias = true;
    canvas.fill_path(
        &path,
        &paint,
        FillRule::Winding,
        Transform::identity(),
        None,
    );
}

/// ICNS container with PNG entries (128–1024 px).
fn encode_icns(base: &resvg::tiny_skia::Pixmap) -> Vec<u8> {
    use resvg::tiny_skia::{FilterQuality, PixmapPaint, Transform};

    let mut body = Vec::new();
    for (kind, size) in [
        (b"ic07", 128u32),
        (b"ic08", 256),
        (b"ic09", 512),
        (b"ic10", 1024),
    ] {
        let png = if size == CANVAS {
            base.encode_png()
        } else {
            let mut small = resvg::tiny_skia::Pixmap::new(size, size).expect("valid size");
            let scale = size as f32 / CANVAS as f32;
            small.draw_pixmap(
                0,
                0,
                base.as_ref(),
                &PixmapPaint {
                    quality: FilterQuality::Bicubic,
                    ..Default::default()
                },
                Transform::from_scale(scale, scale),
                None,
            );
            small.encode_png()
        };
        let Ok(png) = png else { continue };
        body.extend_from_slice(kind);
        body.extend_from_slice(&((png.len() + 8) as u32).to_be_bytes());
        body.extend_from_slice(&png);
    }
    let mut out = b"icns".to_vec();
    out.extend_from_slice(&((body.len() + 8) as u32).to_be_bytes());
    out.extend_from_slice(&body);
    out
}
