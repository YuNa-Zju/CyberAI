use sqlx::{sqlite::SqlitePoolOptions, Row};
use std::io::{self, Write};

#[tokio::main]
async fn main() {
    println!("连接到数据库...");
    let db_url = "sqlite://leaderboard.db?mode=rwc";
    let pool = SqlitePoolOptions::new()
        .connect(db_url)
        .await
        .expect("无法连接到数据库");

    loop {
        println!("\n=========================");
        println!("🛡️  排行榜数据库管理工具");
        println!("=========================");
        println!("1. 查看所有分数 (按分数降序)");
        println!("2. 查看某个玩家的分数");
        println!("3. 删除违规记录 (根据 ID)");
        println!("4. 封禁玩家 (删除该名字的所有记录)");
        println!("5. 退出");
        print!("\n请输入操作编号 [1-5]: ");
        io::stdout().flush().unwrap(); // 确保提示立刻打印出来

        let mut choice = String::new();
        io::stdin().read_line(&mut choice).unwrap();

        match choice.trim() {
            "1" => view_all_scores(&pool).await,
            "2" => view_player_scores(&pool).await,
            "3" => delete_by_id(&pool).await,
            "4" => ban_player(&pool).await,
            "5" => {
                println!("👋 拜拜！");
                break;
            }
            _ => println!("❌ 无效的输入，请输入 1-5 之间的数字。"),
        }
    }
}

async fn view_all_scores(pool: &sqlx::SqlitePool) {
    let records = sqlx::query(
        "SELECT id, player_name, score, phase, created_at FROM scores ORDER BY score DESC LIMIT 20",
    )
    .fetch_all(pool)
    .await
    .unwrap();

    println!("\n🏆 Top 20 记录:");
    println!(
        "{:<5} | {:<15} | {:<8} | {:<5} | {}",
        "ID", "玩家名", "分数", "关卡", "提交时间"
    );
    println!("-------------------------------------------------------------------");
    for row in records {
        let id: i64 = row.get("id");
        let name: String = row.get("player_name");
        let score: i64 = row.get("score");
        let phase: i64 = row.get("phase");
        let created_at: String = row.get("created_at");
        println!(
            "{:<5} | {:<15} | {:<8} | {:<5} | {}",
            id, name, score, phase, created_at
        );
    }
}

async fn view_player_scores(pool: &sqlx::SqlitePool) {
    print!("请输入要查询的玩家名字: ");
    io::stdout().flush().unwrap();
    let mut name = String::new();
    io::stdin().read_line(&mut name).unwrap();
    let name = name.trim();

    let records = sqlx::query(
        "SELECT id, score, phase, created_at FROM scores WHERE player_name = ? ORDER BY score DESC",
    )
    .bind(name)
    .fetch_all(pool)
    .await
    .unwrap();

    println!("\n🔍 玩家 '{}' 的记录:", name);
    for row in records {
        let id: i64 = row.get("id");
        let score: i64 = row.get("score");
        let phase: i64 = row.get("phase");
        let created_at: String = row.get("created_at");
        println!(
            "ID: {:<4} | 分数: {:<6} | 关卡: {} | 时间: {}",
            id, score, phase, created_at
        );
    }
}

async fn delete_by_id(pool: &sqlx::SqlitePool) {
    print!("请输入要删除的记录 ID: ");
    io::stdout().flush().unwrap();
    let mut id_str = String::new();
    io::stdin().read_line(&mut id_str).unwrap();

    if let Ok(id) = id_str.trim().parse::<i64>() {
        let result = sqlx::query("DELETE FROM scores WHERE id = ?")
            .bind(id)
            .execute(pool)
            .await
            .unwrap();

        if result.rows_affected() > 0 {
            println!("✅ 成功删除 ID 为 {} 的记录！", id);
        } else {
            println!("⚠️ 找不到 ID 为 {} 的记录。", id);
        }
    } else {
        println!("❌ 无效的 ID 格式。");
    }
}

async fn ban_player(pool: &sqlx::SqlitePool) {
    print!("请输入要封禁的玩家名字: ");
    io::stdout().flush().unwrap();
    let mut name = String::new();
    io::stdin().read_line(&mut name).unwrap();
    let name = name.trim();

    print!(
        "⚠️ 警告：这会删除 '{}' 的所有分数记录！确定吗？(y/n): ",
        name
    );
    io::stdout().flush().unwrap();
    let mut confirm = String::new();
    io::stdin().read_line(&mut confirm).unwrap();

    if confirm.trim().eq_ignore_ascii_case("y") {
        let result = sqlx::query("DELETE FROM scores WHERE player_name = ?")
            .bind(name)
            .execute(pool)
            .await
            .unwrap();

        println!(
            "✅ 成功清空了玩家 '{}' 的 {} 条违规记录！",
            name,
            result.rows_affected()
        );
    } else {
        println!("🚫 操作已取消。");
    }
}
