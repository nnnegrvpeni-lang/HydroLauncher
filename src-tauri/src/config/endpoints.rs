/// Централизованная конфигурация внешних API и базовых параметров приложения.
/// Все URL и дефолтные лимиты задаются здесь, а пользовательские значения
/// вычисляются динамически исходя из ОС и характеристик железа.

pub const APP_QUALIFIER: &str = "dev";
pub const APP_ORGANIZATION: &str = "hydrolauncher";
pub const APP_NAME: &str = "HydroLauncher";

pub const MOJANG_VERSION_MANIFEST_URL: &str =
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
pub const MOJANG_RESOURCES_BASE_URL: &str = "https://resources.download.minecraft.net";

pub const ADOPTIUM_API_BASE_URL: &str = "https://api.adoptium.net/v3";
pub const MODRINTH_API_BASE_URL: &str = "https://api.modrinth.com/v2";
pub const HORIZON_NIGHTLY_RELEASE_API_URL: &str =
    "https://api.github.com/repos/horizon-rust/horizon/releases/tags/nightly";
pub const HORIZON_MODS_INDEX_URL: &str =
    "https://horizon-rust.github.io/horizon-mods/index.json";
pub const HORIZON_MINECRAFT_VERSION: &str = "26.3";

pub const FABRIC_META_BASE_URL: &str = "https://meta.fabricmc.net/v2";
pub const QUILT_META_BASE_URL: &str = "https://meta.quiltmc.org/v3";
pub const FORGE_MAVEN_BASE_URL: &str = "https://maven.minecraftforge.net";
pub const FORGE_PROMOTIONS_URL: &str =
    "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
pub const NEOFORGE_MAVEN_BASE_URL: &str = "https://maven.neoforged.net/releases";
pub const NEOFORGE_VERSIONS_API_URL: &str =
    "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge";
pub const MAVEN_CENTRAL_URL: &str = "https://repo1.maven.org/maven2/";

pub const DEFAULT_CONCURRENT_DOWNLOADS: usize = 8;
pub const MIN_MEMORY_MB: u64 = 512;
pub const RECOMMENDED_MIN_MEMORY_MB: u64 = 2048;
pub const RECOMMENDED_MAX_MEMORY_MB: u64 = 8192;
