# ととのえ防災 ストア配信準備

2026年11月19日更新。公開Web版はv219。ストア版の提出・配信はこれから行う。

## 確認できたこと

| 工程 | 現在の状態 |
| --- | --- |
| iOS・Androidプロジェクト生成 | Capacitor 8.6.0の構成と、ローカル素材の同梱一致を確認済み |
| ネイティブビルド | v212相当のソースでiOSシミュレーター用アプリ・AndroidデバッグAPKのコンパイルに成功 |
| Web版からの移行 | シミュレーター／エミュレーターで備蓄、片付け写真、写真付きレビューの復元を確認 |
| iOSでの記録保持 | 移行後にアプリを終了して起動し直し、記録・レビュー写真の保持を確認 |
| Web版iPhone実機 | 利用者から初回導線、文字拡大、動画復帰、復元、オフライン、GoogleログインのOKを受領 |
| 本番レビュー | 公開申請、公開一覧への掲載、非公開化を確認済み |
| v214・v215 | 申請前の端末保存、JSON貼り付け復元を自動テストで確認。利用者から「たまごっち」の感想と写真の復元OKを受領 |
| ストア掲載説明 | 日本語原稿を [store-listing-ja.md](store-listing-ja.md) に作成 |
| 配信予定版の再検証 | v215以降の変更を含むネイティブ版でのビルド・操作確認はこれから行う |

検証履歴

- iOS・Androidのビルド https://github.com/minimalisttako/totonoe-bousai-web/actions/runs/43771990502
- Androidのデータ移行 https://github.com/minimalisttako/totonoe-bousai-web/actions/runs/43774179608
- iOS・Androidの移行 https://github.com/minimalisttako/totonoe-bousai-web/actions/runs/43776475295

## 未解決の記録保存問題

利用者から、同じSafariタブで端末内のレビューが空になったとの報告あり。原因は未特定。v214で直接の公開申請にも端末保存を加え、v215でSQLエクスポートのJSON貼り付け復元を追加した。既存の「たまごっち」は復元済み。これらの対処を、消失原因の特定として扱わない。

## 今回の準備（v218・v219）

- サポートメールを公開。受信・返信は利用者からテスト完了の報告あり。
- 公開Web版のデータ取扱いに合わせたプライバシーポリシーを公開し、その他・レビュー・サポートからリンク。
- 投稿別の通報メール作成、送信済みデータの削除相談を追加。これはApple向けアプリ内アカウント削除機能の完了ではない。
- [データ取扱い一覧](data-inventory.md)を作成。事業者側のログ保存・本番認証設定は未照合。

## 次の実装・検証

- ネイティブ版のGoogleログイン。現コードの認証後の戻り先は公開Web版に固定されており、アプリへ戻る処理を整える。
- 実機での写真選択、ファイル書き出し、ファイルからの復元、外部リンク、戻る操作、オフライン表示を確認する。
- 公開レビューに関するストア審査要件を照合し、通報・不適切な投稿者への対応、問い合わせ先、アカウントと投稿の削除経路を実装・検証する。現在のSQL手動操作を一般利用者向けの削除導線として扱わない。
- 第三者ログインに関するAppleの要件と適用例外を確認し、配信版の認証方法を確定する。
- ストア用アイコン・起動画面を確定し、再生成時も適用できるようにする。
- プライバシーポリシーを配信するネイティブ版と再照合し、ストアのデータ申告と掲載画像を準備する。
- 開発者登録状況、正式アプリ識別子、販売価格、配信地域を所有者と確定する。
- 署名した配信ビルドをテスト配布し、実機確認と必要なストア側試験を経て審査へ提出する。

## 再現手順

Node.js 22以上。iOS実ビルドには対応するmacOS・Xcode、Androidには対応するJDK・SDKを用意する。

```sh
npm ci --ignore-scripts
npm run native:add:android
npm run native:add:ios
npm run native:verify
# 生成済みプロジェクトへのWeb版更新
npm run native:sync
```

`native-web/`・`ios/`・`android/`は生成物としてgit対象外。生成後の調整は再現可能な設定やスクリプトに記録する。

アプリID `jp.minimalisttako.totonoebousai` は仮設定。Web版とストア版は保存領域が異なるため、端末間での引き継ぎにはバックアップの読み込みを使う。

鍵・パスワード・証明書を公開リポジトリやチャット本文に置かない。

## 審査要件の参照

2026年11月19日に確認。申請時に最新の記載を再確認する。

- Appleの投稿コンテンツ・ログイン・プライバシーとアカウント削除 https://developer.apple.com/app-store/review/guidelines/
- Google Playの掲載設定 https://support.google.com/googleplay/android-developer/answer/9859152?hl=ja
- Capacitorの設定 https://capacitorjs.com/docs/config
