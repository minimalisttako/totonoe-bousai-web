# ととのえ防災：ストア配信準備

2026-11-08開始。公開Web版v111は維持。ストア版は別工程で、申請・配信済みではありません。

## 進捗の数え方

6つの節目のうち1つ完了。工程の重さは等しくないため、配信までの所要時間の割合ではありません。

1. **完了：再現可能なネイティブプロジェクト生成**。Capacitor 8.6.0、依存のロック、ローカル素材同梱、iOS/Android生成、同梱ファイル一致検証。
2. 未完了：ネイティブ向けの保存・共有・バックアップ・写真選択・外部リンク・戻る操作・オフライン表示と案内の調整。
3. 未完了：署名前ビルド、シミュレーター／エミュレーター・実機試験。ストア用アイコン・起動画面も未設定（生成時は標準素材）。
4. 未完了：プライバシー情報・掲載説明・スクリーンショット・サポート先・年齢設定の準備と所有者確認。
5. 未完了：開発者登録、アプリ識別子の確定、署名、テスト配布。必要なストア側の試験を実施。
6. 未完了：所有者の提出判断、審査、一般公開。

## 再現手順

Node.js 22以上。iOS実ビルドにはmacOS/Xcode 26以上、Androidは対応SDKが必要。

```sh
npm ci --ignore-scripts
npm run native:add:android
npm run native:add:ios
npm run native:verify
# 2回目以降の更新
npm run native:sync
```

`native-web/`・`ios/`・`android/`は生成物としてgit対象外。変更が必要になったら再生成可能な設定・適用スクリプトをソース管理し、手編集だけに依存しないこと。

アプリID `jp.minimalisttako.totonoebousai` は仮設定です。既存の登録の有無を所有者に確認し、初回登録・署名前に確定します。Web版の保存先とは異なるため記録は自動移行されません。Web版のバックアップを新しいストア版に読み込む移行試験は未実施です。

## 検証済みと未検証

検証済み：npm依存解決、両OS向けのプロジェクト生成、同梱HTML/画像/学習問題の原本一致、アプリ名・ID一致、外部サイトを起動画面にするserver.url未指定、Web版19種類のテスト。

未検証：APK/AAB/IPAのコンパイル、起動、実機保存とファイル出力、通知・共有・WebView権限・CORS、各ストア審査。現在のブラウザ向けService Worker案内とBlobバックアップ保存はネイティブ互換を保証しません。ネイティブ対応完了までは申請用ビルドを作成しません。

鍵・パスワード・証明書を公開リポジトリやチャット本文に置かないこと。ストア登録、料金支払い、規約同意、提出はこの準備工程に含めません。

## 参照

- https://capacitorjs.com/docs/getting-started
- https://capacitorjs.com/docs/getting-started/environment-setup
- https://capacitorjs.com/docs/config
- https://developer.apple.com/app-store/review/guidelines/ （4.2。Webサイトを包むだけで審査通過を保証しない）
- https://support.google.com/googleplay/android-developer/answer/14151465 （対象の新規個人アカウントは12人が14日間連続参加するクローズドテスト後に製品版アクセスを申請）
