use axum::{routing::get, Json, Router};
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeFile; // 依然保留你的单文件前端服务

#[derive(Serialize, Deserialize)]
struct ScoreRecord {
    player_name: String,
    score: i64,
    phase: i64,
}

#[tokio::main]
async fn main() {
    let db_url = "sqlite://leaderboard.db?mode=rwc";
    let pool = SqlitePoolOptions::new().connect(db_url).await.unwrap();

    // 保持使用你优雅的迁移系统
    println!("📦 正在检查并运行数据库迁移...");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("数据库迁移执行失败");

    let app = Router::new()
        .route("/api/scores", get(get_scores).post(add_score))
        .fallback_service(ServeFile::new("index.html")) // 保持匹配你的 index.html
        .layer(CorsLayer::permissive())
        .with_state(pool);

    let addr = SocketAddr::from(([0, 0, 0, 0], 1151));
    println!("🚀 游戏服务器已在 http://localhost:1151 启动");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn get_scores(
    axum::extract::State(pool): axum::extract::State<SqlitePool>,
) -> Json<Vec<ScoreRecord>> {
    // 🔥 融合了好友的精髓逻辑：分组去重，取最高分
    // 注意：MAX() 需要使用 as "字段名!" 来向 sqlx 强制解除 Option
    let scores = sqlx::query_as!(
        ScoreRecord,
        r#"
        SELECT 
            player_name as "player_name!", 
            MAX(score) as "score!", 
            MAX(phase) as "phase!" 
        FROM scores 
        GROUP BY player_name 
        ORDER BY score DESC 
        LIMIT 10
        "#
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_else(|err| {
        eprintln!("获取排行榜失败: {}", err);
        vec![]
    });

    Json(scores)
}

async fn add_score(
    axum::extract::State(pool): axum::extract::State<SqlitePool>,
    Json(payload): Json<ScoreRecord>,
) -> &'static str {
    let result = sqlx::query!(
        "INSERT INTO scores (player_name, score, phase) VALUES (?, ?, ?)",
        payload.player_name,
        payload.score,
        payload.phase
    )
    .execute(&pool)
    .await;

    match result {
        Ok(_) => "Score Saved!",
        Err(e) => {
            eprintln!("保存分数失败: {}", e);
            "Failed to save score"
        }
    }
}
