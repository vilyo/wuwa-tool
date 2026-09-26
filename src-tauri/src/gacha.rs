//! 官方唤取记录接口:单池一次 POST(D1:限速与重试在前端,Rust 只发一次)
//!
//! 事实依据 docs/research-2026-09-25-gacha-api.md:国服/国际服仅域名不同,
//! 请求参数全部来自唤取链接,无签名;`code != 0` 的语义判定在前端 domain。

use std::time::Duration;

use serde::{Deserialize, Serialize};

/// 国服接口与 Referer(research §2.1/§5)
pub const CN_ENDPOINT: &str = "https://gmserver-api.aki-game2.com/gacha/record/query";
pub const CN_REFERER: &str = "https://aki-gm-resources.aki-game.com/";
/// 国际服同路径、仅域名不同
pub const OVERSEA_ENDPOINT: &str = "https://gmserver-api.aki-game2.net/gacha/record/query";
pub const OVERSEA_REFERER: &str = "https://aki-gm-resources-oversea.aki-game.net/";

const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/// 服区:cn=国服,oversea=国际服(由前端按链接 host / svr_area 判定)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Region {
    Cn,
    Oversea,
}

impl Region {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "cn" => Some(Region::Cn),
            "oversea" => Some(Region::Oversea),
            _ => None,
        }
    }

    fn endpoint(self) -> &'static str {
        match self {
            Region::Cn => CN_ENDPOINT,
            Region::Oversea => OVERSEA_ENDPOINT,
        }
    }

    fn referer(self) -> &'static str {
        match self {
            Region::Cn => CN_REFERER,
            Region::Oversea => OVERSEA_REFERER,
        }
    }
}

/// 命令错误:`kind` 供前端 domain 在重试前分类——
/// "network"=网络类失败(请求失败/超时/HTTP 非 2xx),按限次重试;
/// "fatal"=确定性失败(参数不合法、客户端初始化失败等),不重试
#[derive(Debug, Serialize)]
pub struct GachaCommandError {
    pub kind: &'static str,
    pub message: String,
}

impl GachaCommandError {
    fn network(message: impl Into<String>) -> Self {
        Self {
            kind: "network",
            message: message.into(),
        }
    }

    fn fatal(message: impl Into<String>) -> Self {
        Self {
            kind: "fatal",
            message: message.into(),
        }
    }
}

/// HTTP 非 2xx 一律按网络类失败报错(官方瞬时 5xx 由前端按限次重试)
fn status_error(status: reqwest::StatusCode) -> GachaCommandError {
    GachaCommandError::network(format!("官方接口响应异常(HTTP {status}),请稍后重试"))
}

/// gacha_query 命令参数:与前端 domain 的 PoolQueryRequest 字段对齐
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GachaQueryRequest {
    pub region: String,
    pub player_id: String,
    /// 鉴权 token,会过期
    pub record_id: String,
    /// URL 的 resources_id(资源版本 hash,各卡池共用)
    pub card_pool_id: String,
    pub card_pool_type: i64,
    pub server_id: String,
    pub language_code: String,
}

/// 官方请求体(cardPoolType 为 int;cardPoolId = 链接 resources_id,research §2.1)
fn request_body(request: &GachaQueryRequest) -> serde_json::Value {
    serde_json::json!({
        "playerId": request.player_id,
        "recordId": request.record_id,
        "cardPoolId": request.card_pool_id,
        "cardPoolType": request.card_pool_type,
        "serverId": request.server_id,
        "languageCode": request.language_code,
    })
}

/// 单池一次 POST(15s 超时,自定义 Referer + 浏览器 UA),返回原始 JSON 文本
#[tauri::command]
pub async fn gacha_query(request: GachaQueryRequest) -> Result<String, GachaCommandError> {
    let region = Region::parse(&request.region).ok_or_else(|| {
        GachaCommandError::fatal(format!("未知的服区标识:{}", request.region))
    })?;
    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| GachaCommandError::fatal(format!("HTTP 客户端初始化失败:{e}")))?;
    let response = client
        .post(region.endpoint())
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .header(reqwest::header::REFERER, region.referer())
        .body(request_body(&request).to_string())
        .send()
        .await
        .map_err(|e| GachaCommandError::network(format!("唤取记录请求失败:{e}")))?;
    if !response.status().is_success() {
        return Err(status_error(response.status()));
    }
    response
        .text()
        .await
        .map_err(|e| GachaCommandError::network(format!("读取唤取记录响应失败:{e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_request(region: &str) -> GachaQueryRequest {
        GachaQueryRequest {
            region: region.into(),
            player_id: "106485288".into(),
            record_id: "acdf99a1".into(),
            card_pool_id: "c9fbcd24".into(),
            card_pool_type: 1,
            server_id: "76402e5b".into(),
            language_code: "zh-Hans".into(),
        }
    }

    #[test]
    fn region_selects_cn_endpoint_and_referer() {
        let region = Region::parse("cn").expect("cn 应可解析");
        assert_eq!(region.endpoint(), CN_ENDPOINT);
        assert_eq!(region.endpoint(), "https://gmserver-api.aki-game2.com/gacha/record/query");
        assert_eq!(region.referer(), "https://aki-gm-resources.aki-game.com/");
    }

    #[test]
    fn region_selects_oversea_endpoint_and_referer() {
        let region = Region::parse("oversea").expect("oversea 应可解析");
        assert_eq!(region.endpoint(), OVERSEA_ENDPOINT);
        assert_eq!(region.endpoint(), "https://gmserver-api.aki-game2.net/gacha/record/query");
        assert_eq!(region.referer(), "https://aki-gm-resources-oversea.aki-game.net/");
    }

    #[test]
    fn unknown_region_is_rejected() {
        assert!(Region::parse("jp").is_none());
        assert!(Region::parse("").is_none());
    }

    #[test]
    fn request_body_matches_official_contract() {
        let body = request_body(&sample_request("cn"));
        assert_eq!(body["playerId"], "106485288");
        assert_eq!(body["recordId"], "acdf99a1");
        // cardPoolId = 链接的 resources_id
        assert_eq!(body["cardPoolId"], "c9fbcd24");
        assert_eq!(body["cardPoolType"], 1);
        assert_eq!(body["serverId"], "76402e5b");
        assert_eq!(body["languageCode"], "zh-Hans");
        // 无签名参数(research §1.4)
        assert!(body.get("sign").is_none());
        assert!(body.get("region_id").is_none());
    }

    #[test]
    fn non_success_status_is_network_class_for_retry() {
        let error = status_error(reqwest::StatusCode::BAD_GATEWAY);
        assert_eq!(error.kind, "network");
        assert!(error.message.contains("502"));

        let not_found = status_error(reqwest::StatusCode::NOT_FOUND);
        assert_eq!(not_found.kind, "network");
    }

    #[test]
    fn command_error_serializes_kind_for_frontend_classification() {
        let network = serde_json::to_value(GachaCommandError::network("唤取记录请求失败:超时")).unwrap();
        assert_eq!(network["kind"], "network");

        let fatal = serde_json::to_value(GachaCommandError::fatal("未知的服区标识:jp")).unwrap();
        assert_eq!(fatal["kind"], "fatal");
        assert_eq!(fatal["message"], "未知的服区标识:jp");
    }
}
