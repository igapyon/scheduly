# Scheduly ベータ公開手順（さくらの VPS 前提）

このドキュメントは、さくらの VPS（Ubuntu 24.04 LTS を想定）上で Scheduly をベータ公開する際の最小構成手順です。アプリは Node.js の in-memory API と静的フロントエンド（`dist/`）で構成されます。テスト公開向けの前提として、再起動でデータが消える点に注意してください。

## 1. サーバー準備

1. VPS を新規作成し、SSH でログイン。
2. 初期更新とツール類をインストールします。
   ```bash
   sudo apt update && sudo apt upgrade -y
   sudo apt install -y build-essential git curl ufw nginx
   ```
3. ファイアウォール設定（必要に応じて）。
   ```bash
   sudo ufw allow OpenSSH
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```
4. Node.js 18 以上をインストールします。`nvm` または NodeSource リポジトリを利用してください。
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   node -v   # 18+
   npm -v
   ```

## 2. アプリ用ユーザー（推奨）

ホームディレクトリでアプリを運用する方針の場合、専用ユーザーを作成すると管理しやすくなります。
```bash
sudo adduser scheduly
sudo usermod -aG sudo scheduly   # 管理権限が必要であれば
su - scheduly
```

## 3. リポジトリ配置とビルド

ユーザーホームに clone してセットアップします。
```bash
cd ~
git clone https://github.com/igapyon/scheduly.git scheduly
cd scheduly
npm ci
npm run build     # /home/scheduly/scheduly/dist に静的ファイルが生成される
```

API サーバー向けの `.env` を作成します（例）。
```dotenv
PORT=4000
BASE_URL=https://example.com
SCHEDULY_SHARE_BASE_URL=https://example.com
```

## 4. API サーバーの常駐

`pm2` もしくは `systemd` のどちらかで常駐させます。ここでは `systemd` 例を示します。

```bash
sudo tee /etc/systemd/system/scheduly-api.service <<'EOF'
[Unit]
Description=Scheduly in-memory API
After=network.target

[Service]
WorkingDirectory=/home/scheduly/scheduly
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/server/index.js
Restart=always
User=scheduly
Group=scheduly

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now scheduly-api
sudo systemctl status scheduly-api
```

動作確認:
```bash
curl http://127.0.0.1:4000/api/healthz
```

## 5. Nginx で静的配信 + リバースプロキシ

1. `dist/` をそのまま Nginx の `root` に指定し、`/api/` へのリクエストを `http://127.0.0.1:4000/` にプロキシします。
2. HTTPS 化は Let’s Encrypt（`certbot`）を利用します。

#### サンプル設定 `/etc/nginx/sites-available/scheduly`
```nginx
server {
    listen 80;
    server_name example.com;

    root /home/scheduly/scheduly/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

適用:
```bash
sudo ln -s /etc/nginx/sites-available/scheduly /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

HTTPS 化（任意）:
```bash
sudo snap install core; sudo snap refresh core
sudo snap install --classic certbot
sudo certbot --nginx -d example.com
```

## 6. 動作確認 checklist

- `https://example.com` にアクセスし、管理画面が開くか。
- 共有URL発行→参加者画面→回答といった基本フローが動くか。
- API 健康チェック: `curl https://example.com/api/healthz`
- Nginx ログと `journalctl -u scheduly-api` でエラーがないか。

## 7. 運用・更新

1. アップデート時:
   ```bash
   cd ~/scheduly
   git pull
   npm ci
   npm run build
   systemctl restart scheduly-api
   sudo systemctl reload nginx
   ```
2. in-memory 構成なので再起動でデータが消えます。UI 上の注意パネルにも明記済みですが、ベータ利用者にも共有してください。
3. バックアップしたい場合は `dist/` と `.env`、リポジトリ以外に特別なファイルはありません。

---

以上で、さくらの VPS 上でホームディレクトリ運用を前提にした最小セットアップが完了します。用途に応じて永続化ストアや監視などを追加してください。
