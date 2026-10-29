# 3D編集と2D平面の連携

[ドキュメント一覧](README.md) · [3Dチュートリアル](tutorials/04-3d-workspace.md)

3D編集は、**平面上の図形を2Dで描き、その面を3D空間に配置する**流れが基本です。投影直下には、平面を持たないXYZの線分や文字も置けます。どちらのタブも同じ`.typ`を編集します。

## 3Dを始める

普通の2Dキャンバスを開いて **3D drawing** を選ぶと、既存の本体をXY平面と`ortho`で囲みます。元のローカル座標を維持するソース変更で、Undoで元へ戻せます。

既存の`ortho`／`perspective`と`on-xy`／`on-xz`／`on-zy`（旧版では`on-yz`）も読み込めます。[複数平面の例](../examples/plane-workspace.typ)を開くと、配置済みの平面から試せます。

![3D drawingタブと、View、Projection、Orbit、Pan、視角プリセットの実画面](images/screenshots/26-3d-workspace.jpg)

**操作：** 上の **3D drawing** に切り替えます。左のOrbit／Panと視角プリセット、右の平面追加ツールを使います。この画像は深度ソートが既定値の状態です。

## 平面を選び、2Dで描く

1. 3Dキャンバス上の平面、またはOutlineの平面をクリックします。平面内の図形をクリックしても、その面を選択します。
2. 左の **Drawing plane** で対象を確認します。
3. **Edit in 2D** を押します。
4. 面を正面から見た状態で、15種類の2DツールやPropertiesを使います。
5. **3D drawing** に戻り、配置された結果を確認します。

2Dタブでは面の本体だけを編集します。面の傾き、空間内の移動、カメラは2D作業画面に持ち込みません。3Dで真横から見える平面も、2Dでは正面から作図できます。

面内では移動、対応するサイズ変更・点操作、コピー／貼り付け、グループ化、パス操作を使えます。未完成のProperties入力があると切り替えを保留するため、先に入力を完成させてください。

![Plane 1のXY平面だけを2Dで開き、Local X/YとBack to 3Dを表示した画面](images/screenshots/30-edit-plane-in-2d.jpg)

**操作：** **Edit in 2D** で開いた画面です。左の`Plane: ... Local X/Y`で対象を確認し、右の通常の2Dツールで描きます。**Back to 3D** で空間表示へ戻れます。

## 基準平面とローカル座標

| 基準面 | 関数 | ローカルの点`(u, v)`のXYZ |
| --- | --- | --- |
| XY | `on-xy` | `(u, v, 0)` |
| XZ | `on-xz` | `(u, 0, v)` |
| ZY | `on-zy` / `on-yz` | `(0, v, u)` |

この対応に平面のオフセット、移動、回転、親の変換を適用します。2DタブのX/Yは常に平面内の軸です。例えばXZ平面のローカルYは、回転前の空間ではZ方向に対応します。

右側のXY／XZ／ZYアイコンで平面を追加します。位置と角度は後から **Drawing plane** で変更できます。新しい面は選択中の投影の末尾に追加します。面の名前や識別用コメントはGUIでの追跡に使います。

![Selected planeをPlane 2 XZにし、Position Yを2、Rotation Zを20にした設定画面](images/screenshots/31-add-xz-plane.jpg)

**数値で配置：** Selected planeで対象を確認し、PositionとRotationのXYZ欄を編集します。新規XZ平面はまだ空なので、中央では薄い背景とローカル軸で位置を確認します。

![XZ平面のローカルX/Yで長方形を描いた2D画面](images/screenshots/32-xz-plane-drawing.jpg)

**面内で作図：** 空の面を **Edit in 2D** で開き、通常のrectツールで描いた例です。Outlineの`3 × 2`は平面内の大きさです。

![描画したXZ平面と元のXY平面を3Dで表示した結果](images/screenshots/33-two-planes.jpg)

**3Dで確認：** **Back to 3D** で戻ると、図形にその面のPositionとRotationが適用されます。

## 平面を移動・回転する

平面を選ぶと、赤X・緑Y・青Zの移動矢印と **RX / RY / RZ** 回転ハンドルが表示されます。

- 矢印をドラッグすると親座標系の軸方向へ移動し、現在のグリッド刻みに吸着します。
- 回転ハンドルを中心の周りへドラッグすると、面の内容の中心を固定して回転します。通常1°、Shift中は15°刻みです。
- ドラッグ中は見た目を更新し、離すと1回のソース変更として保存します。Escで中止します。
- 数値で指定する場合は **Plane position** と **Plane rotation** のXYZを使います。

![選択したXY平面のXYZ移動矢印とRX、RY、RZの回転ハンドルを表示した画面](images/screenshots/29-plane-handles.jpg)

**ドラッグで配置：** 原点付近のX/Y/Zの矢印が移動、RX/RY/RZのリングが回転です。画像はPlane 1を選んだ例です。

位置・角度は親座標系に対する値です。平面の削除は選択してDelete／Backspace、または削除メニューを使います。面の本体も削除し、GUI管理の専用scopeがあればその変換も削除します。参照の検証を通して適用し、Undoで復元できます。

## カメラと画面移動

左の **3D workspace** はView、Camera、Drawing plane、Displayに分かれています。

| 操作 | 効果 | `.typ`への反映 |
| --- | --- | --- |
| Orbit／通常の左ドラッグ | 視点を回転。右ドラッグでY角減少、下ドラッグでX角増加 | あり |
| CameraのAngles・Position | カメラの角度・位置を数値指定 | あり |
| Isometric / Front XY / Top XZ / Side ZY | 視角のプリセットを適用 | あり |
| Pan | 編集画面の表示位置を移動 | なし |
| Zoom in / Zoom out / Fit view | 表示の拡大縮小・全体表示 | なし |
| 既存のView・平面の選択、タブ切り替え | 編集対象を切り替え | なし（最初の3D化を除く） |

Altキーを押さなくても回転できます。Panから回転へ戻るには **Orbit** を押します。3Dでの通常ドラッグは視点回転なので、平面内の図形の移動には2Dタブを使います。3Dの選択は平面または独立した線・文字を1つずつ扱います。

![CameraのAnglesとPosition、Drawing planeのSelected planeとBase planeの実画面](images/screenshots/28-camera-and-plane.jpg)

**操作：** 左パネルをスクロールしてCameraを出します。上のAnglesとPositionはカメラ、下のDrawing planeは平面の設定です。

## 投影の設定と描画順

Viewの **Projection** でOrtho／Perspectiveを選択できます。**Projection properties** またはOutlineの投影見出しを選ぶと、Propertiesで以下を編集できます。

| 引数 | 用途 |
| --- | --- |
| `x` / `y` / `z` | 視角 |
| `sorted` | 深度による並び替え |
| `cull-face` | 面のカリング設定 |
| `reset-transform` | 投影に入る際の変換の扱い |
| `flatten` | `ortho`固有の設定 |
| `distance` | `perspective`の距離。`auto`または使用版で有効な値 |

Outlineでは投影の下に平面・独立した線・文字をまとめます。同じソース上の親に属する項目は、グリップのドラッグや上下ボタンで並び替えられます。別ビューへの移動や参照・状態変更を壊す移動は適用しません。

`sorted: true`ではソース順を変えても最終的な描画は深度順です。ソース順を優先する場合は`sorted: false`を指定します。

![投影PropertiesでsortedをNoにし、同じ面の円と文字を見えるようにした実画面](images/screenshots/27-projection-properties.jpg)

**設定例：** **Projection properties** を開き、`sorted`を **No** にするとソース順で描きます。面の塗りで円や文字が隠れる場合も、この欄を確認してください。

## XYZの線と文字

3Dの右側ツールには **line** と **content** があります。選択した投影へ、直接XYZ座標の呼び出しを書き込みます。新しい描画平面は作りません。

![3Dのlineツールから開いたXYZ段階入力の実画面](images/screenshots/34-xyz-placement.jpg)

**ここに入力：** 右側のXY／XZ／ZYの下にある斜めの線が3Dのline、その下の文字アイコンがcontentです。選ぶとこの入力欄が開きます。見出しで点・軸・段階を確認し、Coordinateへ数値を入れて **Confirm** またはEnterで進みます。

線は始点X → Y → Z、終点X → Y → Zの順です。文字は位置X → Y → Zと文字列を指定します。各段階で軸上をクリックするか、数値を入力してEnterを押します。**Back**または作図中のBackspaceで1段階戻り、Escで中止します。画面に対して垂直な軸は数値で指定してください。

軸拘束線、XYZの組立線、原点・始点・既存座標との吸着ガイドを表示します。確定前のプレビューはソースを書き換えません。

既存の線や文字は3D上またはOutlineで選び、PropertiesでXYZ、文字、塗り・線などを編集できます。線の端点／文字の位置ハンドルをクリックすると、その点だけをガイド付きで指定し直せます。**Edit XYZ** は線の両端を順に編集します。文字のダブルクリックは文字欄へ移動します。式や追加変換のある座標はPropertiesまたはソースで編集します。

![3Dの線の始点と終点をXYZの数値欄で確認した実画面](images/screenshots/35-xyz-line-created.jpg)

**作成後の確認：** PropertiesのGeometryでStartとEndを確認します。画像の線は`(0, 0, 0)`から`(3, 2, 2)`です。左の3D workspaceを折りたたむと、座標欄を広く表示できます。

## 軸・グリッドとプレビュー

Displayの **3D grid** と **XYZ axes** は独立した表示設定です。選択面には青いグリッドと、`O (0, 0)`、`Local X / Local Y`のガイドを表示します。ローカル原点・軸はXYZ axesと一緒に表示を切り替えます。

軸とグリッドの範囲は図の広がりに合わせて変わります。平面背景やガイドは選択対象ではなく、PDF／SVG／PNGに含まれません。

対応するシーンの回転中は、既存の描画を再利用して軽量プレビューを行います。終了時にTypstで再描画し、正確な線幅・深度順・カリングへ戻します。複数ビューや未対応の変換、真横の平面などでは、回転中も頻度を抑えたTypst更新を使います。回転の1操作はGUI Undoでまとめて戻せます。

## 3Dでソース編集が必要になる例

平面内の空間座標や入れ子の投影、解決できない他平面のアンカー、動的に生成される本体などは、2Dビューへ安全に対応付けられない場合があります。平面外の参照を取り違える構造変更も適用しません。

平面内の編集は、適用前に3D文書全体と次の2D表示を検証します。ローカルで描けても全体を壊す変更は書き込みません。保存・互換性の詳細は[ソースと制約](source-and-limitations.md)を参照してください。
