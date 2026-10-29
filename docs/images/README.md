# スクリーンショットの管理

[ドキュメント一覧](../README.md) · [開発者ガイド](../development.md)

## 撮影した画面

`screenshots/`の34枚は、VS CodeのExtension Development Hostで、このリポジトリのGUI CeTZを実際に動かして撮影したJPEGです。GUIを模した図や、Typstの出力だけを並べた画像ではありません。

教材を作業用フォルダーへコピーし、図形の選択、数値入力、色の選択、文字編集、作図、接続、パス演算、平面設定を操作して撮影しています。元の教材は開始状態のまま残しています。

画像はOSと拡張機能の画面をそのまま保存しています。本文の英語のボタン名・項目名は画像内のUIに対応します。VS Code側のメニューは撮影環境の日本語表示です。

## 画面の索引

| ファイル | 撮影した操作・状態 |
| --- | --- |
| [01-open-canvas.jpg](screenshots/01-open-canvas.jpg) | Typst内の▶ GUI CeTZ起動ボタン |
| [02-editor-overview.jpg](screenshots/02-editor-overview.jpg) | 2D画面のOutline・キャンバス・右パレット |
| [03-select-circle.jpg](screenshots/03-select-circle.jpg) | 円を選択し、座標と半径を表示 |
| [04-change-geometry.jpg](screenshots/04-change-geometry.jpg) | X=2、radius=0.75へ変更した結果 |
| [05-appearance-controls.jpg](screenshots/05-appearance-controls.jpg) | Fill・Stroke・Thickness・Dash・Cap・Join |
| [06-color-menu.jpg](screenshots/06-color-menu.jpg) | 塗りの色メニュー |
| [07-edit-text.jpg](screenshots/07-edit-text.jpg) | Text欄への日本語入力 |
| [08-line-tool.jpg](screenshots/08-line-tool.jpg) | 右パレットのlineを選択 |
| [10-line-created.jpg](screenshots/10-line-created.jpg) | 2点をクリックして線を追加した結果 |
| [11-cetz-menu.jpg](screenshots/11-cetz-menu.jpg) | CeTZメニューの描画ツール一覧 |
| [12-bezier-controls.jpg](screenshots/12-bezier-controls.jpg) | 曲線の端点・制御点と対応する数値欄 |
| [13-updated-source.jpg](screenshots/13-updated-source.jpg) | GUIで選んだ曲線に対応するソース範囲 |
| [14-export-format.jpg](screenshots/14-export-format.jpg) | PDF・SVG・PNGの形式選択 |
| [15-png-resolution.jpg](screenshots/15-png-resolution.jpg) | PNGの144／300 ppi選択 |
| [16-connection-start.jpg](screenshots/16-connection-start.jpg) | 接続前の3つのノード |
| [17-connect-controls.jpg](screenshots/17-connect-controls.jpg) | 2図形の複数選択と接続コントロール |
| [18-connector-created.jpg](screenshots/18-connector-created.jpg) | 接続線を追加した結果 |
| [19-connector-follows.jpg](screenshots/19-connector-follows.jpg) | ノード移動に接続線が追従 |
| [20-path-start.jpg](screenshots/20-path-start.jpg) | パス演算前の長方形と円 |
| [21-path-operations.jpg](screenshots/21-path-operations.jpg) | 2図形を選択したPath operations |
| [22-subtract-result.jpg](screenshots/22-subtract-result.jpg) | Subtractで長方形を切り抜いた結果 |
| [23-compound-path.jpg](screenshots/23-compound-path.jpg) | Compound pathで穴を作った結果 |
| [24-frame-selection.jpg](screenshots/24-frame-selection.jpg) | Frame selectionで枠を追加した結果 |
| [25-plane-2d-start.jpg](screenshots/25-plane-2d-start.jpg) | 3D化前の平面A |
| [26-3d-workspace.jpg](screenshots/26-3d-workspace.jpg) | 3Dタブへ切り替えた直後のWorkspace |
| [27-projection-properties.jpg](screenshots/27-projection-properties.jpg) | 投影PropertiesのsortedをNoに変更 |
| [28-camera-and-plane.jpg](screenshots/28-camera-and-plane.jpg) | カメラの角度・位置と描画平面の選択 |
| [29-plane-handles.jpg](screenshots/29-plane-handles.jpg) | 平面選択時のXYZ移動・回転ハンドル |
| [30-edit-plane-in-2d.jpg](screenshots/30-edit-plane-in-2d.jpg) | Edit in 2Dで開いた平面のローカル編集 |
| [31-add-xz-plane.jpg](screenshots/31-add-xz-plane.jpg) | 新しいXZ平面の位置・回転設定 |
| [32-xz-plane-drawing.jpg](screenshots/32-xz-plane-drawing.jpg) | XZ平面内に3×2の長方形を描画 |
| [33-two-planes.jpg](screenshots/33-two-planes.jpg) | 2Dで描いたXZ平面を3Dへ戻した結果 |
| [34-xyz-placement.jpg](screenshots/34-xyz-placement.jpg) | XYZの線の段階入力ダイアログ |
| [35-xyz-line-created.jpg](screenshots/35-xyz-line-created.jpg) | XYZ線の始点・終点をPropertiesで確認 |

`properties.png`と`control-points.png`は元からあるスクリーンショットです。現在の操作ガイドには、上記の撮り直した画像を使っています。

## 撮り直すとき

1. [ローカル起動](../installation.md)に従ってExtension Development Hostを起動します。
2. `docs/tutorials/code/`の教材を作業用フォルダーへコピーします。
3. 教材のCodeLensからGUIを開きます。図形を選ぶとソースを表示するため、ソースとGUIは別のエディターグループに置きます。
4. GUI側を大きく表示する場合は、VS Codeの **View: Maximize Editor Group and Hide Side Bars** を使います。
5. 手順の対象が見える位置まで左パネルをスクロールし、選択状態・入力欄・操作結果を確認して撮影します。
6. 同じ操作の画像を置き換えるときは、既存のファイル名を維持します。表示項目や値を変えた場合は本文の説明も更新します。

3D化直後の画像では深度ソートが既定値です。円と文字が見える画像ではProjection propertiesの`sorted`をNoにしています。31はXZ平面を追加した直後、32は面内の作図、33以降は長方形を描いた後の状態です。Plane Bの文字は追加前です。

更新時は、別の文書・個人情報・無関係なダイアログが写っていないことと、画像内の操作がキャプションに一致していることを確認してください。実画面を図解へ置き換えず、ボタンや入力欄が読めるサイズで配置します。
