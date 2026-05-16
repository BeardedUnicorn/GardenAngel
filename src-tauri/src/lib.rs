mod coach;
mod db;
mod error;
mod export;
mod journal;
mod plants;
mod project;
mod secret;
mod settings;
mod shapes;
mod sketch;

pub use error::SerializableError;

/// Native macOS menu bar (Phase 8). Predefined items only — New/Open/
/// Save/Export already have on-screen buttons; this satisfies the
/// File/Edit/View/Help + About-with-version requirement without
/// frontend event wiring.
fn build_menu(app: &tauri::AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{AboutMetadataBuilder, MenuBuilder, SubmenuBuilder};

    let about = AboutMetadataBuilder::new()
        .name(Some("GardenAngel"))
        .version(Some(env!("CARGO_PKG_VERSION")))
        .copyright(Some("© 2026 Michael Herold"))
        .build();

    let app_menu = SubmenuBuilder::new(app, "GardenAngel")
        .about(Some(about.clone()))
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;
    let file_menu = SubmenuBuilder::new(app, "File").close_window().build()?;
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let view_menu = SubmenuBuilder::new(app, "View").fullscreen().build()?;
    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .separator()
        .close_window()
        .build()?;
    let help_menu = SubmenuBuilder::new(app, "Help")
        .about(Some(about))
        .build()?;

    MenuBuilder::new(app)
        .items(&[
            &app_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &window_menu,
            &help_menu,
        ])
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .manage(project::ProjectState::default())
        .setup(|app| {
            let menu = build_menu(app.handle())?;
            app.set_menu(menu)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            project::project_new,
            project::project_open,
            project::project_save,
            project::project_close,
            project::project_current,
            shapes::shapes_list,
            shapes::bed_create,
            shapes::bed_update,
            shapes::bed_delete,
            shapes::path_create,
            shapes::path_update,
            shapes::path_delete,
            shapes::structure_create,
            shapes::structure_update,
            shapes::structure_delete,
            sketch::strokes_list,
            sketch::stroke_create,
            sketch::stroke_update,
            sketch::stroke_delete,
            sketch::sketch_apply_cleanup,
            secret::secret_set,
            secret::secret_get,
            secret::secret_has,
            secret::secret_delete,
            settings::settings_get_all,
            settings::setting_get,
            settings::setting_set,
            plants::plant_cache_get,
            plants::plant_cache_put,
            plants::plantings_list,
            plants::planting_create,
            plants::planting_delete,
            coach::coach_conversation_ensure,
            coach::coach_messages_list,
            coach::coach_message_add,
            coach::observations_recent,
            coach::observations_for_bed,
            journal::observation_create,
            journal::observations_list,
            journal::observation_delete,
            journal::observation_photo_read,
            export::pdf_save,
        ])
        .run(tauri::generate_context!())
        .expect("error while running GardenAngel");
}
