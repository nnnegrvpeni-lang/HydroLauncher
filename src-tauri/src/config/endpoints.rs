/// Централизованная конфигурация внешних API и базовых параметров приложения.
/// Все URL и дефолтные лимиты задаются здесь, а пользовательские значения
/// вычисляются динамически исходя из ОС и характеристик железа.

pub const APP_QUALIFIER: &str = "dev";
pub const APP_ORGANIZATION: &str = "hydrolauncher";
pub const APP_NAME: &str = "HydroLauncher";

pub const MOJANG_VERSION_MANIFEST_URL: &str =
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
/// Префикс, которому обязаны соответствовать URL версий из манифеста Mojang.
pub const MOJANG_PISTON_PREFIX: &str = "https://piston-meta.mojang.com/";
pub const MOJANG_RESOURCES_BASE_URL: &str = "https://resources.download.minecraft.net";

/// Вход в Microsoft/Xbox Live и Minecraft Services.
pub const MICROSOFT_CLIENT_ID: &str = "00000000402b5328";
pub const MICROSOFT_AUTH_REPLY_URL: &str = "https://login.live.com/oauth20_desktop.srf";
pub const MICROSOFT_OAUTH_TOKEN_URL: &str = "https://login.live.com/oauth20_token.srf";
pub const MICROSOFT_SCOPE: &str = "service::user.auth.xboxlive.com::MBI_SSL";
pub const XBOX_DEVICE_AUTH_URL: &str = "https://device.auth.xboxlive.com/device/authenticate";
pub const XBOX_SISU_AUTHENTICATE_URL: &str = "https://sisu.xboxlive.com/authenticate";
pub const XBOX_SISU_AUTHORIZE_URL: &str = "https://sisu.xboxlive.com/authorize";
pub const XBOX_XSTS_AUTHORIZE_URL: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
pub const XBOX_DEVICE_RELYING_PARTY: &str = "http://auth.xboxlive.com";
pub const XBOX_USER_RELYING_PARTY: &str = "http://xboxlive.com";
pub const XBOX_XSTS_RELYING_PARTY: &str = "rp://api.minecraftservices.com/";
pub const MINECRAFT_LAUNCHER_LOGIN_URL: &str = "https://api.minecraftservices.com/launcher/login";
pub const MINECRAFT_ENTITLEMENTS_URL: &str =
    "https://api.minecraftservices.com/entitlements/license";
pub const MINECRAFT_PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";
pub const MINECRAFT_SKINS_URL: &str = "https://api.minecraftservices.com/minecraft/profile/skins";
pub const MINECRAFT_SKINS_ACTIVE_URL: &str =
    "https://api.minecraftservices.com/minecraft/profile/skins/active";
pub const MINECRAFT_CAPES_ACTIVE_URL: &str =
    "https://api.minecraftservices.com/minecraft/profile/capes/active";
pub const MINECRAFT_SERVICES_USER_AGENT: &str =
    concat!("HydroLauncher/", env!("CARGO_PKG_VERSION"));

pub const ADOPTIUM_API_BASE_URL: &str = "https://api.adoptium.net/v3";
pub const MODRINTH_API_BASE_URL: &str = "https://api.modrinth.com/v2";
pub const HORIZON_RELEASES_API_URL: &str =
    "https://api.github.com/repos/horizon-rust/horizon/releases?per_page=50";
pub fn horizon_release_by_tag_url(tag: &str) -> String {
    format!("https://api.github.com/repos/horizon-rust/horizon/releases/tags/{tag}")
}
pub const HORIZON_MODS_INDEX_URL: &str = "https://horizon-rust.github.io/horizon-mods/index.json";
pub const HORIZON_MINECRAFT_VERSION: &str = "26.3";

/// Репозиторий и релизы самого лаунчера.
pub const HYDRO_REPO_URL: &str = "https://github.com/nnnegrvpeni-lang/HydroLauncher";
pub const HYDRO_ISSUES_URL: &str =
    "https://github.com/nnnegrvpeni-lang/HydroLauncher/issues/new/choose";
pub const HYDRO_LATEST_RELEASE_API_URL: &str =
    "https://api.github.com/repos/nnnegrvpeni-lang/HydroLauncher/releases/latest";

/// Веб-страницы проектов (открываются в браузере по кнопке «Открыть на …»).
pub const MODRINTH_WEB_PROJECT_URL: &str = "https://modrinth.com/mod/";
pub const HORIZON_WEB_MOD_URL: &str = "https://playhorizon.dev/mods/";

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
