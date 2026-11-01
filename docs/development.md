# 開発者ガイド

[ドキュメント一覧](README.md) · [ローカル起動](installation.md)

![Extension Development Hostで教材のTypstファイルを開いた実画面](images/screenshots/01-open-canvas.jpg)

ローカル起動後の確認画面です。CodeLensの **▶ GUI CeTZ** から拡張機能のGUIを開きます。

## 構成と実行環境

本体はCommonJSのJavaScriptで、VS Code APIとNode.js組み込みモジュールを使います。ビルドや本体用の`npm install`は不要です。編集画面は既存のDraw.io Integrationへプラグインを読み込ませます。独立したDraw.ioアプリを同梱する構成ではありません。

[package.json](../package.json)に拡張機能の入口、5つのコマンド、VS Codeの対応版、Draw.io Integrationへの依存、テストコマンドがあります。開発時はTypst CLIと、テストで使うCeTZパッケージも必要です。

## 処理の流れ

1. `scanner.js`がキャンバスのソース範囲を検出します。
2. `render-diagram.js`から編集用の描画を試み、個別編集ができなければ正確なSVGプレビューを表示します。
3. `advanced.js`などがTypstの計測結果、各図形のSVG、選択枠・ハンドルを対応付けます。
4. `extension.js`が`gui-cetz:`の仮想文書を開き、Draw.io Integrationへ表示を渡します。
5. `cetz-drawio-plugin.js`が操作をDraw.io XMLの属性・アクションとして通知します。
6. ソース範囲・版・参照・操作条件を確認し、変更案を検証してからTypst文書へパッチを適用します。
7. 更新後のTypstから再描画し、選択や表示状態を復元します。

GUI入力はキューで順に処理します。古いsceneやbaseを使う編集を拒否し、処理中の後続入力を扱います。3D平面はローカル用の一時ソースと元のbodyの位置を対応付け、全体の検証後に本体内へ反映します。

## ソースファイルの役割

| ファイル（`src/`） | 主な役割 |
| --- | --- |
| `extension.js` | 起動、コマンド、セッション、同期、ソース適用 |
| `scanner.js` / `diagram.js` | 文字列・コメント・入れ子を考慮した構文走査と基本図形の認識 |
| `launch-code-lenses.js` | キャンバスごとの起動ボタン |
| `diagram-files.js` / `plugin-settings.js` | 仮想文書と復元、Draw.ioプラグインの登録 |
| `render-diagram.js` / `preview.js` | 描画経路の選択、Typst CLIによるSVG生成 |
| `advanced.js` / `svg-layers.js` | 高度な図形の計測・書き戻し、図形別SVGの分離 |
| `drawio.js` / `style.js` / `marks.js` | Draw.io XML、色と線、端点記号の変換 |
| `properties.js` / `templates.js` | 引数スキーマと編集、挿入テンプレート |
| `placement.js` / `snapping.js` | クリック作図のソース生成、座標精度 |
| `source-actions.js` / `path-operations.js` | 配置、グループ、接続、共有点、パス合成 |
| `clipboard.js` / `clipboard-3d.js` / `history.js` | ソースを用いた2D・3Dのコピー・貼り付け、GUI履歴 |
| `selection.js` / `scene.js` / `diagram-status.js` | 選択通知、sceneの識別と版、状態表示 |
| `three-dimensional.js` / `three-workspace.js` | 3Dシーン、投影の校正、軸・グリッド、空間への追加 |
| `plane-editor.js` / `plane-boolean.js` | 平面・カメラの編集、2Dローカル表示、面内Booleanの補助 |
| `export.js` | 文書全体のPDF・SVG・PNG出力 |
| `cetz-drawio-plugin.js` | CeTZ専用UI、点操作、作図、3Dプレビュー、操作通知 |

## テスト

リポジトリのルートで実行します。

```sh
npm test
```

Node.js組み込みのテストランナーを使います。ソースパッチ、名前と参照、図形操作、履歴、仮想文書、プロパティ、配置、3D校正・平面編集などを検証します。Typstを実行するテストもあるため、`typst`と対象CeTZパッケージを使える環境にしてください。

必要な領域だけ調べる例です。

```sh
node --test test/properties.test.js test/source-actions.test.js
node --test test/plane-editor.test.js test/three-workspace.test.js
```

### 任意のDraw.io DOM統合テスト

`test/native-preview.test.js`は、jsdomとインストール済みDraw.ioの実装を使ってポインター操作とSVG DOMを検証します。依存関係がなければ該当テストはスキップします。

| 環境変数 | 指定するもの |
| --- | --- |
| `GUI_CETZ_DOM_MODULE` | `require()`できるjsdomモジュールのパス。未指定では`jsdom`を試す |
| `GUI_CETZ_MXCLIENT` | Draw.ioの`mxClient.js`へのパス |
| `GUI_CETZ_EDITOR_UI` | 必要に応じてDraw.ioの`js/diagramly/EditorUi.js`へのパス。通常はmxClientの位置から推定 |

次のパスは自分の環境の実際の場所へ置き換えます。

```sh
GUI_CETZ_DOM_MODULE=/absolute/path/to/node_modules/jsdom \
GUI_CETZ_MXCLIENT=/absolute/path/to/mxClient.js \
GUI_CETZ_EDITOR_UI=/absolute/path/to/js/diagramly/EditorUi.js \
npm test
```

自動テストは実際のVS Codeウィンドウでの全操作を保証しません。UI変更時はExtension Development Hostでも、起動、プラグイン許可、入力、ドラッグ、ソース反映、Undo、タブ切り替えを確認します。任意テストのスキップは成功件数と区別して記録してください。

## 変更時に守ること

- 元の`.typ`を正本とし、別の保存用図面を増やさない。
- GUI操作と元の呼び出し・ソース版を対応付け、古い要求を適用しない。
- 編集外のコメント・式・引数を維持し、構造変更ではアンカー依存関係も検証する。
- 3Dの一時プレビューや編集ガイドを、ソース・Draw.ioの編集対象・Typst出力へ混ぜない。
- 平面のローカル編集では面外を変更せず、全体をコンパイルしてから適用する。
- 文字入力中のIMEや未完成値、処理中の後続編集、Undo単位を保つ。
- 通常のDraw.io文書では標準UIを維持する。

## パッケージ化

```sh
npx @vscode/vsce package
```

`.vscodeignore`で除外するファイルを確認し、生成されたVSIXをインストールして動作を確かめます。配布版の動作確認では **Developer: Reload Window** も実行します。バージョンを変えた場合はREADMEのインストール例も更新してください。

## 文書の更新

新しい機能は該当リファレンスと`docs/README.md`へ追加し、クリック順やボタン名を実装に合わせます。教材は`docs/tutorials/code/`へ置き、Typstでコンパイルします。READMEは概要と開始手順を中心に保ち、細かな条件を対応するガイドから参照できるようにします。

画面画像の撮影手順は[スクリーンショットの管理](images/README.md)を参照してください。
