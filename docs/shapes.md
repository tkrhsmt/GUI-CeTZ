# 図形リファレンス

[ドキュメント一覧](README.md) · [プロパティの入力方法](properties.md)

2Dパレットには15種類の描画ツールがあります。3Dの平面を **Edit in 2D** で開いた場合も同じツールを使えます。図形名はCeTZの関数名です。

![CeTZメニューに15種類の描画ツールが並ぶ実画面](images/screenshots/11-cetz-menu.jpg)

**操作：** 左上の **CeTZ** を開き、使う図形名を選びます。右側のアイコンからも同じツールを選べます。

## クリック順と主な設定

| ツール | 指定する点の順番 | 主な設定 |
| --- | --- | --- |
| `rect` | 向かい合う2つの角 | 角の座標、角丸`radius` |
| `circle` | 中心 → 半径を決める点 | 中心、`radius`。2要素の半径で楕円 |
| `content` | 文字を置く位置 | 位置、Text、`angle`、`anchor`、`padding` |
| `line` | 始点 → 終点 | 座標、`close`、線、始点・終点記号 |
| `polygon` | 中心 → 頂点 | 辺数、`radius`、`angle`。追加時は6角形 |
| `circle-through` | 円周上の3点 | Point A/B/C |
| `arc-through` | 始点 → 通過点 → 終点 | 3点、`mode`、端点記号 |
| `bezier-through` | 始点 → 通過点 → 終点 | 3点、端点記号、`shorten` |
| `arc` | 中心 → 始点 → 終点の方向 | `start`、`stop`、`delta`、`radius`、`mode` |
| `mark` | 始点 → 終点 | `symbol`、`scale`、幅・長さ・向き |
| `n-star` | 中心 → 外側の半径を決める点 | 頂点数、`radius`、`inner-radius`、`angle` |
| `grid` | 向かい合う2つの角 | `step`、`shift`、`help-lines` |
| `bezier` | 始点 → 終点 → 制御点1 → 制御点2 | 各点、端点記号、`shorten` |
| `hobby` | 2点以上の節点 → Enterまたはダブルクリック | 各点、`close`、`ta`、`tb`、`omega` |
| `catmull` | 2点以上の節点 → Enterまたはダブルクリック | 各点、`close`、`tension` |

`circle-through`と`arc-through`の3点は、同一直線上に置かないでください。円・星・多角形の半径は正の値、長方形・グリッドの幅と高さは0以外、線・markの始終点は異なる点を指定します。

`arc`のクリック作図は、中心と始点から半径を決め、3点目の方向まで反時計回りに描きます。3点目の中心からの距離は半径には使いません。`bezier`は「始点、終点、制御点1、制御点2」の順である点に注意してください。

![BezierのStart、End、Control 1、Control 2とキャンバス上の点を表示した画面](images/screenshots/12-bezier-controls.jpg)

**確認：** Bezierを選ぶと、左の4組の座標と、右の青い端点・オレンジの制御点が対応します。

## ソースの書き方

以下は`cetz.canvas`内で`import cetz.draw: *`した後の呼び出し例です。

```typst
rect((0, 0), (3, 2), radius: 10%, fill: blue.lighten(85%))
circle((4, 1), radius: (0.8, 0.5), stroke: 1pt + blue)
polygon((6, 1), 5, radius: 0.8, angle: 18deg)
line((0, 3), (1, 4), (2, 3), mark: (end: ">"))
bezier((3, 3), (6, 3), (4, 5), (5, 1), stroke: red)
content((3, 6), [CeTZ])
```

GUIで追加する`line`は2点ですが、ソースで複数点を持つ`line`も読み込めます。既存の点の位置はハンドルやPropertiesで変更でき、点の個数を変える場合はソースを編集します。

## 選択済みの図形に使う4種類の関数

以下は単独の作図アイコンではなく、選択した図形に対する **Path operations** から生成します。

| 関数 | 操作 | 用途 |
| --- | --- | --- |
| `boolean` | Unite / Intersect / Subtract / Exclude | 閉じた図形の領域を合成・切り抜きする |
| `merge-path` | Merge paths | 複数のパスをソース順に接続する |
| `compound-path` | Compound path | 複数輪郭を1つのパスにし、内側に穴を作る |
| `rect-around` | Frame selection | 選択図形の大きさに追従する囲み枠を作る |

選択条件と具体例は[パス操作](path-operations.md)を参照してください。`boolean`はCeTZ 0.4.2にはありません。

## 形状別の編集上の注意

- リテラル座標の基本図形は移動・対応するサイズ変更を行えます。`rect`のリテラル相対終点も扱えます。
- アンカーや計算式を使った基本図形は、解決した位置に表示し、参照を維持した相対移動を行える場合があります。サイズ変更はソースで行います。
- `n-star`は一様なサイズ変更を使います。横方向だけの引き伸ばしは受け付けません。
- `content`の枠のサイズ変更では文字サイズは変わりません。文字サイズはTypstのスタイルや内容式で指定します。
- 式、変換、生成方法によっては、同じ関数でもハンドルを表示できません。[対応範囲](source-and-limitations.md)を確認してください。
