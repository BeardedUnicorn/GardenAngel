mod db;
mod error;
mod project;
mod secret;
mod settings;
mod shapes;
mod sketch;

pub use error::SerializableError;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .manage(project::ProjectState::default())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running GardenAngel");
}
