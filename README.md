# オンライン<ruby>投票<rt>とうひょう</rt></ruby>サービス | Online Voting Service
## 言語対応 | つかえることば | Language Support
|  | 日本語(漢字) | <ruby>日本語<rt>にほんご</rt></ruby>(ひらがな) | English |
|-:|:-:|:-:|:-:|
| トップ<br>Top | ○ | ○ | ○ |
| マスター<br>開催者<br>せんせい<br>Master | ○ | ×<br>※開催者向けのページは存在 | ○ |
| スレーブ<br>参加者<br>こども<br>Slave | ○ | ○ | ○ |

**<ruby>日本語<rt>にほんご</rt></ruby>(ひらがな)** と **English** の2言語は`Ver 4`から利用可能になりました．

**<ruby>日本語<rt>にほんご</rt></ruby>(ひらがな)** と **English** の2つのことばは`Ver 4`からつかえるようになりました．

The languages **<ruby>日本語<rt>にほんご</rt></ruby>(ひらがな)** and **English** are available from `Ver 4`．

## 概要 | Description
GitHub Pagesで動作する「オンライン投票サービス」です．
集計・同期にはFirebase Realtime Databaseを用いています（サーバーレス構成）．

- マスター画面で項目名編集・投票リセットが可能
- スレーブ（参加者）はID指定で投票
- 投票・ラベルはリアルタイム同期

- - -

This is Online Voting Service, deployed by GitHub Pages.
It based on Google Firebase Realtime Database, with no my own server.
This method provides you reliable votes.

- editing items' name and initializing a votes are available in master page
- participants can join to a vote by voting id
- the number of votes and items' labels are shown real-timely

## 使い方 | How to Use
1. [トップページ](https://hobbuy-blog.github.io/voting)を開きます
2. 投票開催者の方は`新しい投票を開始(マスター画面)`を押します<br>**この時，開催者の方はページを閉じないようにしてください．閉じてしまった場合に備えてリンクをメモしておくことを推奨します**
3. 必要に応じて投票項目の名前を変更してください
4. 参加者に投票IDあるいは投票ページのリンクを共有してください
5. 参加者はテキスト入力欄に開催者から共有されたコードを入力して`参加(スレーブ画面)`を押します

利用目的は基本的に自由ですが，本サービスを用いた違法またはそれに準ずる行為や，サービスの自作発言，コードの再配布はおやめください．開発者の私は一切の責任を負いません．

- - -

1. Open the [top page](https://hobbuy-blog.github.io/voting)
2. Start a vote<br>**Please DO NOT close the master page, I recommend you to note the url**
3. Change items' names if it's necessary
4. Share your voting id or link to participants
5. Participants join to the vote

You can use this service for almost any purpose, except ilegal pirposes. I'm not responsible for kinds of accident caused by this service.
