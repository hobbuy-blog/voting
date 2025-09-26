# voting

## 概要

GitHub Pagesで動作する「リアルタイム多数決」アプリです。  
集計・同期にはFirebase Realtime Databaseを用いています（サーバーレス構成）。

- マスター画面で項目名編集・投票リセットが可能
- スレーブ（参加者）はID指定で投票
- 投票・ラベルはリアルタイム同期

## 使い方

1. **Firebaseプロジェクトを作成**  
   - [Firebaseコンソール](https://console.firebase.google.com/)で新規プロジェクト作成
   - Realtime Databaseを有効化（テストモードでOK、必要ならセキュリティルール追加）

2. **Firebase設定を書き換え**  
   - `vote.js` の `firebaseConfig` 内、`YOUR_API_KEY` などを自分の値に変更

3. **ファイルを配置**  
   - index.html, master.html, slave.html, vote.js をリポジトリ直下に配置

4. **GitHub Pages有効化**  
   - リポジトリの「Settings」→「Pages」で、`main`ブランチのルートを指定して公開

5. **利用方法**  
   - 公開URLで `index.html` にアクセス
   - 「新しい投票を開始」でマスター画面、「参加」でスレーブ画面を開く

## 注意

- Firebase無料枠で十分に動作します。
- 不特定多数の利用や長期運用時は、DBセキュリティルールの強化を推奨。
