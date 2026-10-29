# インストールと起動

[ドキュメント一覧](README.md)

## 必要なもの

| ソフト | 用途 |
| --- | --- |
| VS Code 1.90.0以降 | GUI CeTZを実行するエディター |
| Draw.io Integration（`hediet.vscode-drawio`） | 図形の編集画面 |
| Typst CLI | プレビューの描画、変更の検証、ファイル出力 |
| Node.js・npm | リポジトリからのVSIX作成や開発・テスト時に使用 |

Typst用のエディター拡張だけでは、GUI CeTZが使う`typst`コマンドの代わりになりません。VS Codeの統合ターミナルで次を実行し、コマンドが見つかることを確認してください。

```sh
typst --version
```

CeTZは`.typ`のimportから読み込まれます。チュートリアルでは`@preview/cetz:0.5.3`を使います。パッケージが未取得の場合は、初回コンパイル時に取得できる環境が必要です。

## VSIXからインストールする

1. VS CodeでDraw.io Integrationをインストールします。
2. このリポジトリのルートで次を実行します。

   ```sh
   npx @vscode/vsce package
   ```

3. 作成したVSIXをインストールします。以下のバージョンは`package.json`が`0.2.0`の場合です。

   ```sh
   code --install-extension gui-cetz-0.2.0.vsix
   ```

   `code`コマンドがない場合は、VS Codeの拡張機能画面で **… → Install from VSIX…** を選びます。

4. `.typ`ファイルを開き、`cetz.canvas`上の **▶ GUI CeTZ** をクリックします。
5. Draw.ioがCeTZプラグインの信頼を確認したら、利用するプラグインを許可します。

リポジトリ内に古いVSIXがある場合も、今回作成したバージョンのファイルを選んでください。

## 最初の起動で行われること

GUI CeTZは、同梱の`src/cetz-drawio-plugin.js`をDraw.ioのプラグイン設定へ登録します。既存の別プラグイン設定は維持します。過去のCeTZプラグイン登録が重複している場合は、現在のものにまとめます。

プラグインを許可すると、CeTZ専用のタブ、左サイドバー、右側の描画ツールが表示されます。許可しなかった場合はDraw.ioの通常UIが残るため、専用の操作画面を使うにはプラグインの許可が必要です。

## ソースから開発用に起動する

1. VS Codeでこのリポジトリのフォルダーを開きます。
2. **Run → Run Without Debugging**（実行 → デバッグなしで実行）を選びます。
3. 選択を求められたら **Run GUI CeTZ Extension** を選びます。
4. 開いたExtension Development Hostで教材の`.typ`を開きます。
5. **▶ GUI CeTZ** または **CeTZ: Open GUI Editor** を実行します。

起動設定は[`.vscode/launch.json`](../.vscode/launch.json)にあります。拡張機能本体にはビルド手順や`npm install`は不要です。テストの追加依存関係は[開発者ガイド](development.md)を参照してください。

## 更新したとき

新しいVSIXをインストールした後は、利用中の各VS Codeウィンドウで **Developer: Reload Window** を実行します。開いたままのウィンドウでは、以前読み込んだ拡張機能コードが動き続ける場合があります。プラグインファイルの更新後は、Draw.ioの信頼確認が再度表示されることがあります。

![Typstソースのcetz.canvas直前に表示されたGUI CeTZ起動ボタン](images/screenshots/01-open-canvas.jpg)

**操作：** `.typ`を開き、`cetz.canvas`の直前にある **▶ GUI CeTZ** をクリックします。通常のTypstプレビューボタンとは別のボタンです。

## 起動確認

[チュートリアル1の開始ファイル](tutorials/code/01-first-drawing.typ)を開き、図形の移動が`.typ`へ反映されれば基本的な接続を確認できます。開けない場合は[トラブル対処](troubleshooting.md)へ進んでください。
