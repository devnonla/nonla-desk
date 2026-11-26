// The same binary is the app and the `nonladesk` CLI.
fn main() {
    if nonla_desk_lib::cli::is_cli_invocation() {
        std::process::exit(nonla_desk_lib::cli::run());
    }
    nonla_desk_lib::run();
}
