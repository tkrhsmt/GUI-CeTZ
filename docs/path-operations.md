# パス操作

[ドキュメント一覧](README.md) · [切り抜きのチュートリアル](tutorials/03-path-design.md)

長方形や円などを組み合わせて、合成した輪郭や穴あき図形、追従する囲み枠を作れます。図形を選択すると、左側の **Path operations** に操作が表示されます。CeTZメニューや右クリックメニューからも実行できます。

## 操作の選び方

| 操作 | 結果 | 必要な選択 |
| --- | --- | --- |
| Unite | 塗られた領域をひとまとめにする | 閉じたパスを2つ以上 |
| Intersect | 共通する領域を残す | 閉じたパスを2つ以上 |
| Subtract | 最初の図形から後の図形を引く | 閉じたパスを2つ以上 |
| Exclude | 奇数回重なった領域を残す | 閉じたパスを2つ以上 |
| Merge paths | ソース順にパスを接続する | パスを2つ以上 |
| Compound path | 複数の輪郭を1つにまとめる | パスを2つ以上 |
| Frame selection | 図形に追従する長方形の枠を追加する | 図形を1つ以上 |

最初の4つはCeTZの`boolean`を使います。CeTZ 0.4.2では利用できません。0.5.2以降を使ってください。

![長方形と円を複数選択し、Unite、Intersect、Subtractなどのボタンを表示した画面](images/screenshots/21-path-operations.jpg)

**操作：** 同じグループの閉じた図形を2つ選び、左のPath operationsから演算を押します。画像は左下のSubtractを使う直前です。

## 閉じたパスとは

長方形、円、多角形、星などは閉じたパスです。線やHobby・Catmull・Merge pathsは、Propertiesの`close: true`で閉じます。円弧は`mode: "CLOSE"`または`"PIE"`を使うと閉じた領域になります。

文字、アンカー、単独のmarkはBooleanの入力には使えません。開いた曲線を接続したいときは **Merge paths** を使います。

## 順序と見た目

操作対象は**クリック順ではなくソース順**に並びます。Subtractは、Outlineで先にある図形を基準に残りを引きます。3つ以上では順番に合成します。

合成後は選択した呼び出しを、元のコードを内包する操作の呼び出しへ置き換えます。先頭図形の明示的な`fill`と`stroke`を結果へ引き継ぎ、結果を選択します。Propertiesでは演算の種類、オペランド本文、対応する引数を編集できます。結果が空になってもOutlineから選択できます。Undoで操作前の入力へ戻せます。

![Subtractで長方形の右側が円形に切り抜かれた実画面](images/screenshots/22-subtract-result.jpg)

**結果：** ソースで先にある長方形から、後の円の領域が引かれます。

## Compound pathで穴を作る

外側の輪郭と内側の輪郭を選び、**Compound path** を実行します。GUIは`fill-rule: "even-odd"`を指定するため、入れ子になった輪郭で穴ができます。重なり方に応じて塗りが切り替わり、BooleanのUniteとは結果が異なります。

![大きい円と小さい円をCompound pathにした結果の実画面](images/screenshots/23-compound-path.jpg)

**操作：** 入れ子の2つの円を選んで **Compound path** を押します。結果の塗り規則はPropertiesで確認できます。

## Frame selectionで追従する枠を作る

囲みたい図形を選んで **Frame selection** を実行します。元の図形はそのまま残り、必要な名前と、それらを参照する`rect-around`を追加します。元の図形を動かしたりサイズを変えたりすると、枠も追従します。

枠を選び、`padding`、角丸`radius`、塗り・線などをPropertiesで調整できます。枠が前面の図を隠す場合は、塗りを`none`にするか、対応する重なり順操作を使います。

![合成結果を囲むrect-aroundを追加した実画面](images/screenshots/24-frame-selection.jpg)

**操作：** 囲みたい結果を選んで **Frame selection** を押します。元の図形と別の枠が追加されます。

## 操作できないとき

選択物は同じグループに属している必要があります。選択間にスタイル・変換・実行文がある場合や、消費されるBoolean入力の名前を外部の図形が参照している場合は適用されません。まず[ソースと制約](source-and-limitations.md)で依存関係を確認してください。

3D表示ではパス操作を直接行いません。対象の平面を **Edit in 2D** で開いて操作します。平面内のBooleanにはローカル座標で演算するための補助コードを生成し、適用前に3D文書全体も検証します。
