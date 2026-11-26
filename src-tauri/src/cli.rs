//! `nonladesk` command-line client. Same binary as the app: when it is invoked as
//! `nonladesk` (symlink) or with arguments, it runs this instead of opening a window,
//! and sends commands to the running app over the Unix socket in `server.rs`.

use std::io::{BufRead, BufReader, Read, Write};
use std::os::unix::net::UnixStream;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

use clap::{Parser, Subcommand};
use serde_json::{json, Map, Value};

use crate::paths;

const GUIDE_DEVELOP: &str =
    include_str!("../../plugins/nonla-desk/skills/nonla-desk/references/develop.md");
const GUIDE_ICON: &str =
    include_str!("../../plugins/nonla-desk/skills/nonla-desk/references/icon.md");
const GUIDE_PUBLISH: &str =
    include_str!("../../plugins/nonla-desk/skills/nonla-market/references/publish.md");
const GUIDE_REVIEW: &str =
    include_str!("../../plugins/nonla-desk/skills/nonla-market/references/review.md");

#[derive(Parser)]
#[command(
    name = "nonladesk",
    bin_name = "nonladesk",
    version,
    about = "Manage Nonla Desk mini apps from the terminal",
    long_about = "Manage Nonla Desk mini apps from the terminal.\n\n\
        Commands talk to the running Nonla Desk app (it is started if needed).\n\
        <APP> is an app id or name. Run `nonladesk guide` before writing mini app code."
)]
struct Cli {
    /// Print raw JSON instead of text
    #[arg(long, global = true)]
    json: bool,
    #[command(subcommand)]
    command: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// List mini apps
    #[command(alias = "ls")]
    List,
    /// Show an app's details and file paths
    Get {
        app: String,
        /// Print one file's source: frontend, backend or panel
        #[arg(long)]
        file: Option<String>,
    },
    /// Print the app's directory, or one file's path
    Path {
        app: String,
        /// frontend, backend, panel or icon
        file: Option<String>,
    },
    /// Create a new mini app (created disabled)
    Create {
        name: String,
        /// Unique id, lowercase with hyphens (default: derived from the name), e.g. color-picker
        #[arg(long)]
        id: Option<String>,
        /// Frontend source file (.jsx). A starter component is used if omitted.
        #[arg(long)]
        frontend: Option<PathBuf>,
        /// Backend source file (.js)
        #[arg(long)]
        backend: Option<PathBuf>,
        /// Tray panel source file (.jsx)
        #[arg(long)]
        panel: Option<PathBuf>,
        #[arg(long)]
        description: Option<String>,
        /// Icon name (e.g. Key) or an inline <svg …>…</svg>
        #[arg(long)]
        icon: Option<String>,
        /// SVG icon file (see the guide's Icon section)
        #[arg(long)]
        icon_file: Option<PathBuf>,
        #[arg(long)]
        category: Option<String>,
        #[arg(long = "version")]
        version: Option<String>,
        /// Check the code, then enable the app if the check passes
        #[arg(long)]
        enable: bool,
    },
    /// Replace one file of an app with FILE, or stdin when FILE is "-" or omitted
    Write {
        app: String,
        /// frontend, backend or panel
        file: String,
        source: Option<PathBuf>,
    },
    /// Change name, description, icon, category or version
    Update {
        app: String,
        #[arg(long)]
        name: Option<String>,
        #[arg(long)]
        description: Option<String>,
        /// Icon name (e.g. Key) or an inline <svg …>…</svg>; "" removes an SVG icon
        #[arg(long)]
        icon: Option<String>,
        /// SVG icon file
        #[arg(long)]
        icon_file: Option<PathBuf>,
        #[arg(long)]
        category: Option<String>,
        #[arg(long = "version")]
        version: Option<String>,
    },
    /// Transpile and syntax-check an app, or files that are not saved yet
    Check {
        app: Option<String>,
        #[arg(long)]
        frontend: Option<PathBuf>,
        #[arg(long)]
        backend: Option<PathBuf>,
        #[arg(long)]
        panel: Option<PathBuf>,
        /// SVG icon file
        #[arg(long)]
        icon_file: Option<PathBuf>,
    },
    /// Re-read files from disk, restart the backend, refresh open windows
    Reload { app: String },
    /// Enable an app (starts its backend)
    Enable { app: String },
    /// Disable an app (stops its backend)
    Disable { app: String },
    /// Delete an app, its files and its data
    #[command(alias = "rm")]
    Delete {
        app: String,
        /// Required: confirms the deletion
        #[arg(long)]
        yes: bool,
    },
    /// Recent backend logs (ctx.log, stdout/stderr, crashes)
    Logs {
        app: String,
        /// Number of lines
        #[arg(short = 'n', long, default_value_t = 100)]
        lines: u64,
    },
    /// Show Nonla Desk, optionally with an app open
    Open { app: Option<String> },
    /// Install an app as its own macOS app (~/Applications/Nonla Apps) with its own Dock icon
    Install {
        app: String,
        /// Launch it after installing
        #[arg(long)]
        open: bool,
    },
    /// Remove an app's standalone macOS app (the mini app itself stays)
    Uninstall { app: String },
    /// Import a mini app from a .zip or a directory (it stays disabled; refuses to overwrite an app of the same name)
    Import {
        path: PathBuf,
        /// Overwrite an existing app of the same name
        #[arg(long)]
        force: bool,
    },
    /// Export an app as a .zip
    Export {
        app: String,
        #[arg(short, long)]
        out: Option<PathBuf>,
    },
    /// Share mini apps through marketplaces (GitHub repos with a marketplace.json)
    #[command(subcommand)]
    Market(MarketCmd),
    /// App version, JS runtime (Bun/Node) and paths
    Status,
    /// Print a guide: develop (default), icon, publish or review
    Guide {
        #[arg(value_parser = ["develop", "icon", "publish", "review"])]
        topic: Option<String>,
    },
}

#[derive(Subcommand)]
enum MarketCmd {
    /// Add a marketplace: user/repo (GitHub), a git URL or a local path
    Add {
        source: String,
        /// Local name (defaults to the name in marketplace.json)
        #[arg(long)]
        name: Option<String>,
    },
    /// List added marketplaces
    #[command(alias = "ls")]
    List,
    /// Fetch the latest version of one marketplace, or all
    Update { name: Option<String> },
    /// Remove a marketplace (apps installed from it stay)
    Remove { name: String },
    /// List the apps of a marketplace (all if omitted), with install and update state
    Apps { market: Option<String> },
    /// Show an app of a marketplace and where its files are, to review before installing
    Show {
        /// <id>@<market>
        app: String,
    },
    /// Install (or update) an app from a marketplace. It is installed disabled.
    Install {
        /// <id>@<market>
        app: String,
        /// Overwrite an existing app with the same id that came from elsewhere
        #[arg(long)]
        force: bool,
    },
    /// Copy an app into a marketplace checkout (a marketplace name or a directory)
    Publish {
        app: String,
        #[arg(long)]
        to: String,
    },
}

/// True when this process should act as the CLI rather than the app.
/// The app binary is `nonla-desk`; the CLI is the `nonladesk` symlink to it.
pub fn is_cli_invocation() -> bool {
    let mut args = std::env::args_os();
    let argv0 = args.next().map(PathBuf::from).unwrap_or_default();
    if argv0.file_name().is_some_and(|n| n == "nonladesk") {
        return true;
    }
    // Finder used to pass -psn_*; anything else means a CLI call.
    args.next()
        .is_some_and(|a| !a.to_string_lossy().starts_with("-psn_"))
}

pub fn run() -> i32 {
    let cli = Cli::parse();
    match execute(&cli) {
        Ok(code) => code,
        Err(e) => {
            if cli.json {
                println!("{}", json!({ "ok": false, "error": e }));
            } else {
                eprintln!("error: {e}");
            }
            1
        }
    }
}

fn read_source(path: &Path) -> Result<String, String> {
    if path == Path::new("-") {
        let mut s = String::new();
        std::io::stdin()
            .read_to_string(&mut s)
            .map_err(|e| e.to_string())?;
        return Ok(s);
    }
    std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))
}

fn read_icon(path: &Path) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))
}

/// `--icon` is a name, an inline `<svg>`, or "" (remove the SVG); `--icon-file` is SVG.
fn icon_args(
    args: &mut Map<String, Value>,
    icon: Option<&str>,
    file: Option<&Path>,
) -> Result<(), String> {
    if let Some(f) = file {
        args.insert("iconSvg".into(), read_icon(f)?.into());
    } else if let Some(i) = icon {
        let key = if i.is_empty() || i.trim_start().starts_with("<svg") {
            "iconSvg"
        } else {
            "icon"
        };
        args.insert(key.into(), i.into());
    }
    Ok(())
}

fn absolute(p: &Path) -> String {
    std::fs::canonicalize(p)
        .unwrap_or_else(|_| p.to_path_buf())
        .to_string_lossy()
        .into_owned()
}

type Human<'a> = &'a dyn Fn(&Value);

fn run_market(cmd: &MarketCmd, out: &dyn Fn(&Value, Human)) -> Result<i32, String> {
    let s = |v: &Value, k: &str| v[k].as_str().unwrap_or_default().to_string();
    match cmd {
        MarketCmd::Add { source, name } => {
            let v = call("market_add", json!({ "source": source, "name": name }))?;
            out(&v, &|v| {
                println!(
                    "Added marketplace \"{}\" with {} app(s). Browse: nonladesk market apps {}",
                    s(v, "name"),
                    v["apps"],
                    s(v, "name")
                )
            });
        }
        MarketCmd::List => {
            let v = call("market_list", json!({}))?;
            out(&v, &|v| match v.as_array().filter(|a| !a.is_empty()) {
                None => println!("No marketplace. Add one: nonladesk market add <user/repo>"),
                Some(list) => {
                    for m in list {
                        println!(
                            "{:<24} {:>3} apps  {}",
                            s(m, "name"),
                            m["apps"],
                            s(m, "source")
                        );
                    }
                }
            });
        }
        MarketCmd::Update { name } => {
            let v = call("market_update", json!({ "name": name }))?;
            out(&v, &|v| {
                for m in v.as_array().into_iter().flatten() {
                    match m["error"].as_str() {
                        Some(e) => println!("{}: {e}", s(m, "name")),
                        None if m["changed"].as_bool() == Some(true) => {
                            println!("{}: updated", s(m, "name"))
                        }
                        None => println!("{}: up to date", s(m, "name")),
                    }
                }
            });
        }
        MarketCmd::Remove { name } => {
            let v = call("market_remove", json!({ "name": name }))?;
            out(&v, &|v| {
                println!("Removed marketplace \"{}\".", s(v, "name"))
            });
        }
        MarketCmd::Apps { market } => {
            let v = call("market_apps", json!({ "market": market }))?;
            out(&v, &|v| {
                for a in v.as_array().into_iter().flatten() {
                    let state = match (a["installed"].as_str(), a["update"].as_bool()) {
                        (Some(i), Some(true)) => format!("installed {i}, update available"),
                        (Some(i), _) => format!("installed {i}"),
                        _ => String::new(),
                    };
                    println!(
                        "{}@{}  {}  {}\n    {}",
                        s(a, "name"),
                        s(a, "market"),
                        s(a, "version"),
                        state,
                        s(a, "description")
                    );
                }
            });
        }
        MarketCmd::Show { app } => {
            let v = call("market_show", json!({ "app": app }))?;
            out(&v, &|v| {
                println!("{}@{}", s(v, "name"), s(v, "market"));
                println!("dir: {}", s(v, "dir"));
                for f in v["files"].as_array().into_iter().flatten() {
                    println!("  {} ({} bytes)", s(f, "path"), f["bytes"]);
                }
                println!("Read these files before installing: backends can run shell commands.");
            });
        }
        MarketCmd::Install { app, force } => {
            let v = call("market_install", json!({ "app": app, "force": force }))?;
            out(&v, &|v| {
                let verb = if v["updated"].as_bool() == Some(true) {
                    "Updated"
                } else {
                    "Installed"
                };
                println!(
                    "{verb} \"{}\" ({}). It is disabled until you run: nonladesk enable {}",
                    s(v, "name"),
                    s(v, "slug"),
                    s(v, "slug")
                );
            });
        }
        MarketCmd::Publish { app, to } => {
            let target = if to.contains('/') || to.starts_with('.') {
                absolute(Path::new(to))
            } else {
                to.clone()
            };
            let v = call("market_publish", json!({ "app": app, "to": target }))?;
            out(&v, &|v| {
                println!(
                    "Published \"{}\" {} to {}/{}.\nNext: git add, commit and push that repo.",
                    s(v, "name"),
                    s(v, "version"),
                    s(v, "dir"),
                    s(v, "source")
                )
            });
        }
    }
    Ok(0)
}

fn execute(cli: &Cli) -> Result<i32, String> {
    let out = |v: &Value, human: &dyn Fn(&Value)| {
        if cli.json {
            println!("{}", serde_json::to_string_pretty(v).unwrap_or_default());
        } else {
            human(v);
        }
    };

    match &cli.command {
        Cmd::Guide { topic } => {
            print!(
                "{}",
                match topic.as_deref() {
                    Some("icon") => GUIDE_ICON,
                    Some("publish") => GUIDE_PUBLISH,
                    Some("review") => GUIDE_REVIEW,
                    _ => GUIDE_DEVELOP,
                }
            );
            Ok(0)
        }
        Cmd::List => {
            let v = call("list", json!({}))?;
            out(&v, &print_list);
            Ok(0)
        }
        Cmd::Get { app, file } => {
            let v = call("get", json!({ "app": app, "file": file }))?;
            if file.is_some() && !cli.json {
                print!("{}", v["content"].as_str().unwrap_or_default());
            } else {
                out(&v, &print_app);
            }
            Ok(0)
        }
        Cmd::Path { app, file } => {
            let v = call("get", json!({ "app": app }))?;
            let key = file.as_deref().unwrap_or("dir");
            if !["dir", "frontend", "backend", "panel", "icon"].contains(&key) {
                return Err("file must be frontend, backend, panel or icon".into());
            }
            println!("{}", v["paths"][key].as_str().unwrap_or_default());
            Ok(0)
        }
        Cmd::Create {
            name,
            id: slug,
            frontend,
            backend,
            panel,
            description,
            icon,
            icon_file,
            category,
            version,
            enable,
        } => {
            let mut args = Map::new();
            icon_args(&mut args, icon.as_deref(), icon_file.as_deref())?;
            args.insert("name".into(), name.clone().into());
            if let Some(s) = slug {
                args.insert("id".into(), s.clone().into());
            }
            for (k, p) in [
                ("frontend", frontend),
                ("backend", backend),
                ("panel", panel),
            ] {
                if let Some(p) = p {
                    args.insert(k.into(), read_source(p)?.into());
                }
            }
            for (k, s) in [
                ("description", description),
                ("category", category),
                ("version", version),
            ] {
                if let Some(s) = s {
                    args.insert(k.into(), s.clone().into());
                }
            }
            let created = call("create", Value::Object(args))?;
            let id = created["id"].as_str().unwrap_or_default().to_string();
            if !cli.json {
                println!(
                    "Created \"{}\" ({id}), disabled.",
                    created["name"].as_str().unwrap_or_default()
                );
                println!(
                    "  dir: {}",
                    created["paths"]["dir"].as_str().unwrap_or_default()
                );
            }
            let mut code = 0;
            if *enable {
                let checked = call("check", json!({ "app": id }))?;
                if !cli.json {
                    print_check(&checked);
                }
                if checked["ok"].as_bool() == Some(true) {
                    call("enable", json!({ "app": id }))?;
                    if !cli.json {
                        println!("Enabled.");
                    }
                } else {
                    code = 2;
                }
            } else if !cli.json {
                let sid = created["slug"].as_str().unwrap_or(&id);
                println!("Next: nonladesk check {sid} && nonladesk enable {sid}");
            }
            if cli.json {
                println!(
                    "{}",
                    serde_json::to_string_pretty(&created).unwrap_or_default()
                );
            }
            Ok(code)
        }
        Cmd::Write { app, file, source } => {
            let content = read_source(source.as_deref().unwrap_or(Path::new("-")))?;
            let v = call(
                "write",
                json!({ "app": app, "file": file, "content": content }),
            )?;
            out(&v, &|v| {
                println!(
                    "Wrote {file} of \"{}\" and reloaded.",
                    v["name"].as_str().unwrap_or_default()
                )
            });
            Ok(0)
        }
        Cmd::Update {
            app,
            name,
            description,
            icon,
            icon_file,
            category,
            version,
        } => {
            let mut args = Map::new();
            for (k, s) in [
                ("app", Some(app)),
                ("name", name.as_ref()),
                ("description", description.as_ref()),
                ("category", category.as_ref()),
                ("version", version.as_ref()),
            ] {
                if let Some(s) = s {
                    args.insert(k.into(), s.clone().into());
                }
            }
            icon_args(&mut args, icon.as_deref(), icon_file.as_deref())?;
            let v = call("update", Value::Object(args))?;
            out(&v, &|v| {
                println!("Updated \"{}\".", v["name"].as_str().unwrap_or_default())
            });
            Ok(0)
        }
        Cmd::Check {
            app,
            frontend,
            backend,
            panel,
            icon_file,
        } => {
            let mut args = Map::new();
            if let Some(a) = app {
                args.insert("app".into(), a.clone().into());
            }
            if let Some(f) = icon_file {
                args.insert("iconSvg".into(), read_icon(f)?.into());
            }
            for (k, p) in [
                ("frontend", frontend),
                ("backend", backend),
                ("panel", panel),
            ] {
                if let Some(p) = p {
                    args.insert(k.into(), read_source(p)?.into());
                }
            }
            let v = call("check", Value::Object(args))?;
            out(&v, &print_check);
            Ok(if v["ok"].as_bool() == Some(true) {
                0
            } else {
                2
            })
        }
        Cmd::Reload { app } => {
            let v = call("reload", json!({ "app": app }))?;
            out(&v, &|v| {
                println!("Reloaded \"{}\".", v["name"].as_str().unwrap_or_default())
            });
            Ok(0)
        }
        Cmd::Enable { app } | Cmd::Disable { app } => {
            let cmd = if matches!(cli.command, Cmd::Enable { .. }) {
                "enable"
            } else {
                "disable"
            };
            let v = call(cmd, json!({ "app": app }))?;
            out(&v, &|v| {
                println!("\"{}\" {cmd}d.", v["name"].as_str().unwrap_or_default())
            });
            Ok(0)
        }
        Cmd::Delete { app, yes } => {
            if !yes {
                return Err(format!(
                    "This deletes \"{app}\", its files and its stored data. Re-run with --yes to confirm."
                ));
            }
            let v = call("delete", json!({ "app": app }))?;
            out(&v, &|v| {
                println!("Deleted \"{}\".", v["name"].as_str().unwrap_or_default())
            });
            Ok(0)
        }
        Cmd::Logs { app, lines } => {
            let v = call("logs", json!({ "app": app, "limit": lines }))?;
            out(&v, &print_logs);
            Ok(0)
        }
        Cmd::Open { app } => {
            let v = call("open", json!({ "app": app }))?;
            out(&v, &|_| {});
            Ok(0)
        }
        Cmd::Install { app, open } => {
            let v = call("install", json!({ "app": app, "open": open }))?;
            out(&v, &|v| {
                println!(
                    "Installed \"{}\" at {}",
                    v["name"].as_str().unwrap_or_default(),
                    v["path"].as_str().unwrap_or_default()
                )
            });
            Ok(0)
        }
        Cmd::Uninstall { app } => {
            let v = call("uninstall", json!({ "app": app }))?;
            out(&v, &|v| match v["removed"].as_str() {
                Some(p) => println!("Removed {p}"),
                None => println!(
                    "\"{}\" is not installed.",
                    v["name"].as_str().unwrap_or_default()
                ),
            });
            Ok(0)
        }
        Cmd::Import { path, force } => {
            let v = call("import", json!({ "path": absolute(path), "force": force }))?;
            out(&v, &|v| {
                let verb = if v["updated"].as_bool() == Some(true) {
                    "Updated"
                } else {
                    "Imported"
                };
                println!(
                    "{verb} \"{}\" ({}).",
                    v["name"].as_str().unwrap_or_default(),
                    v["slug"].as_str().unwrap_or_default()
                );
                for f in v["files"].as_array().into_iter().flatten() {
                    println!(
                        "  {} ({} bytes)",
                        f["path"].as_str().unwrap_or_default(),
                        f["bytes"]
                    );
                }
                println!(
                    "It is disabled. Read its code (`nonladesk path {id}`), run `nonladesk check {id}`, \
                     then `nonladesk enable {id}`.",
                    id = v["slug"].as_str().unwrap_or_default()
                );
            });
            Ok(0)
        }
        Cmd::Export { app, out: dest } => {
            let dest = match dest {
                Some(d) => d.clone(),
                None => {
                    let info = call("get", json!({ "app": app }))?;
                    let slug: String = info["name"]
                        .as_str()
                        .unwrap_or("app")
                        .to_lowercase()
                        .chars()
                        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
                        .collect();
                    PathBuf::from(format!("{slug}.miniapp.zip"))
                }
            };
            let target = std::env::current_dir()
                .map(|d| d.join(&dest))
                .unwrap_or(dest);
            let v = call("export", json!({ "app": app, "out": target }))?;
            out(&v, &|v| {
                println!("Exported to {}", v["path"].as_str().unwrap_or_default())
            });
            Ok(0)
        }
        Cmd::Market(m) => run_market(m, &out),
        Cmd::Status => {
            let v = call("status", json!({}))?;
            out(&v, &|v| {
                println!(
                    "Nonla Desk {}{}",
                    v["version"].as_str().unwrap_or("?"),
                    if v["dev"].as_bool() == Some(true) {
                        " (dev)"
                    } else {
                        ""
                    }
                );
                match v["runtime"].as_object() {
                    Some(rt) => println!(
                        "Runtime:  {} {} ({})",
                        rt["kind"].as_str().unwrap_or("?"),
                        rt["version"].as_str().unwrap_or(""),
                        rt["path"].as_str().unwrap_or("")
                    ),
                    None => println!(
                        "Runtime:  none — backends cannot run. Install Bun: {}",
                        v["bunInstallCommand"].as_str().unwrap_or_default()
                    ),
                }
                println!("Apps:     {}", v["appsDir"].as_str().unwrap_or_default());
                println!("Database: {}", v["database"].as_str().unwrap_or_default());
                println!("Socket:   {}", v["socket"].as_str().unwrap_or_default());
            });
            Ok(0)
        }
    }
}

// ─── Output ──────────────────────────────────────────────────────────────────

fn parts(v: &Value) -> String {
    let mut p = Vec::new();
    for (k, label) in [
        ("hasFrontend", "frontend"),
        ("hasBackend", "backend"),
        ("hasPanel", "panel"),
    ] {
        if v[k].as_bool() == Some(true) {
            p.push(label);
        }
    }
    p.join("+")
}

fn state(v: &Value) -> &'static str {
    match (v["enabled"].as_bool(), v["running"].as_bool()) {
        (Some(true), Some(true)) => "running",
        (Some(true), _) => "enabled",
        _ => "disabled",
    }
}

fn print_list(v: &Value) {
    let apps = v.as_array().cloned().unwrap_or_default();
    if apps.is_empty() {
        println!(
            "No mini apps yet. Create one: nonladesk create \"My App\" --frontend ./frontend.jsx"
        );
        return;
    }
    let width = apps
        .iter()
        .map(|a| a["name"].as_str().unwrap_or_default().chars().count())
        .max()
        .unwrap_or(4)
        .max(4);
    let id_width = apps
        .iter()
        .map(|a| a["slug"].as_str().unwrap_or_default().chars().count())
        .max()
        .unwrap_or(2)
        .max(2);
    println!(
        "{:<id_width$}  {:<width$}  {:<8}  FILES",
        "ID", "NAME", "STATE"
    );
    for a in apps {
        println!(
            "{:<id_width$}  {:<width$}  {:<8}  {}",
            a["slug"].as_str().unwrap_or_default(),
            a["name"].as_str().unwrap_or_default(),
            state(&a),
            parts(&a)
        );
    }
}

fn print_app(v: &Value) {
    println!(
        "{} ({})",
        v["name"].as_str().unwrap_or_default(),
        v["id"].as_str().unwrap_or_default()
    );
    let desc = v["description"].as_str().unwrap_or_default();
    if !desc.is_empty() {
        println!("  {desc}");
    }
    println!("  state:    {}", state(v));
    println!(
        "  icon:     {}   category: {}   version: {}",
        if v["iconSvg"].is_string() {
            "icon.svg"
        } else {
            v["icon"].as_str().unwrap_or_default()
        },
        v["category"].as_str().unwrap_or_default(),
        v["version"].as_str().unwrap_or_default()
    );
    println!("  files:    {}", parts(v));
    for k in ["dir", "frontend", "backend", "panel"] {
        println!(
            "  {:<9} {}",
            format!("{k}:"),
            v["paths"][k].as_str().unwrap_or_default()
        );
    }
}

fn print_check(v: &Value) {
    if let Some(name) = v["name"].as_str() {
        println!("Check \"{name}\":");
    }
    for f in v["files"].as_array().into_iter().flatten() {
        let ok = f["ok"].as_bool() == Some(true);
        println!(
            "  {} {}",
            if ok { "✓" } else { "✗" },
            f["file"].as_str().unwrap_or_default()
        );
        for e in f["errors"].as_array().into_iter().flatten() {
            for (i, line) in e.as_str().unwrap_or_default().lines().enumerate() {
                println!("      {}{line}", if i == 0 { "- " } else { "  " });
            }
        }
    }
    println!("{}", v["message"].as_str().unwrap_or_default());
}

fn print_logs(v: &Value) {
    let logs = v["logs"].as_array().cloned().unwrap_or_default();
    if logs.is_empty() {
        println!(
            "No logs for \"{}\" (backend {}).",
            v["name"].as_str().unwrap_or_default(),
            if v["running"].as_bool() == Some(true) {
                "running"
            } else {
                "not running"
            }
        );
    }
    for l in logs {
        let ts = l["timestamp"].as_u64().unwrap_or(0) / 1000;
        let (h, m, s) = ((ts / 3600) % 24, (ts / 60) % 60, ts % 60);
        println!(
            "{h:02}:{m:02}:{s:02} UTC [{}] {}",
            l["stream"].as_str().unwrap_or_default(),
            l["text"].as_str().unwrap_or_default()
        );
    }
}

// ─── Transport ───────────────────────────────────────────────────────────────

fn call(cmd: &str, args: Value) -> Result<Value, String> {
    let stream = connect()?;
    stream.set_read_timeout(Some(Duration::from_secs(300))).ok();
    let mut writer = stream.try_clone().map_err(|e| e.to_string())?;
    writeln!(writer, "{}", json!({ "cmd": cmd, "args": args })).map_err(|e| e.to_string())?;
    let mut line = String::new();
    BufReader::new(stream)
        .read_line(&mut line)
        .map_err(|e| e.to_string())?;
    let resp: Value =
        serde_json::from_str(&line).map_err(|e| format!("bad response from app: {e}"))?;
    if resp["ok"].as_bool() == Some(true) {
        Ok(resp["data"].clone())
    } else {
        Err(resp["error"]
            .as_str()
            .unwrap_or("unknown error")
            .to_string())
    }
}

fn connect() -> Result<UnixStream, String> {
    let path = paths::socket_path();
    if let Ok(s) = UnixStream::connect(&path) {
        return Ok(s);
    }
    if paths::IS_DEV {
        return Err(format!(
            "Nonla Desk (dev) is not running ({} not found). Start it with `bun dev`.",
            path.display()
        ));
    }
    eprintln!("Starting Nonla Desk…");
    launch_app()?;
    for _ in 0..60 {
        std::thread::sleep(Duration::from_millis(250));
        if let Ok(s) = UnixStream::connect(&path) {
            return Ok(s);
        }
    }
    Err("Nonla Desk did not start. Open it from /Applications and try again.".into())
}

/// Open the .app this binary lives in, or the installed bundle.
fn launch_app() -> Result<(), String> {
    let bundle = std::env::current_exe()
        .and_then(std::fs::canonicalize)
        .ok()
        .and_then(|exe| exe.ancestors().nth(3).map(Path::to_path_buf))
        .filter(|p| p.extension().is_some_and(|e| e == "app"));
    let status = match bundle {
        Some(b) => Command::new("open").arg("-g").arg(b).status(),
        None => Command::new("open")
            .args(["-g", "-b", paths::BUNDLE_ID])
            .status(),
    };
    match status {
        Ok(s) if s.success() => Ok(()),
        _ => Err(
            "Nonla Desk is not running and could not be started. Is it installed in /Applications?"
                .into(),
        ),
    }
}

/// Link `~/.local/bin/nonladesk` to this binary when there is no working link yet
/// (first launch, or the app moved). A link to another existing build is kept.
pub fn ensure_link() {
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    let Some(home) = dirs::home_dir() else { return };
    let dir = home.join(".local/bin");
    // The CLI used to be called `nonla`: drop the old link when it points at this app.
    let old = dir.join("nonla");
    if std::fs::read_link(&old).is_ok_and(|t| {
        t.file_name()
            .is_some_and(|n| n == "nonla-desk" || n == "nonladesk")
    }) {
        let _ = std::fs::remove_file(&old);
    }
    let link = dir.join("nonladesk");
    let working = std::fs::read_link(&link).is_ok_and(|target| target.exists());
    if working || (link.exists() && link.symlink_metadata().is_ok_and(|m| !m.is_symlink())) {
        return;
    }
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::remove_file(&link);
    match std::os::unix::fs::symlink(&exe, &link) {
        Ok(()) => println!("[cli] linked {} -> {}", link.display(), exe.display()),
        Err(e) => eprintln!("[cli] could not link {}: {e}", link.display()),
    }
}
