---
title: Shadow DOM——浏览器自带的组件化封装
description: 从样式隔离到事件处理，系统梳理 Shadow DOM 的核心概念、创建方式、样式穿透手段以及与自定义元素 / Slot 的协作机制。
pubDatetime: 2026-03-01T00:00:00+08:00
draft: false
tags: ["Web Components", "Shadow DOM", "前端"]
---

我第一次了解 Shadow DOM 是在接触样式隔离的过程中，后来在网上搜集了一些视频和文章，对于 Shadow DOM 有了一些更全面的认知。

不知道大家会不会对于一些标签感到奇怪，比如音频标签（`<audio>`）、视频标签（`<video>`）等，感觉像是一种被封装的组件，有自己的样式和逻辑，而不是类似于 `<div>`、`<p>` 这些仅仅只代表结构的标签。你的感觉是对的，上述的多媒体标签不是常规意义上的结构标签，而是使用 Shadow DOM 实现的一种"组件标签"，可以使用如下方法进行观察：进入开发者工具，在设置中打开"显示用户代理阴影 DOM"。

这时再检查 `<video>` 标签时会发现可以展开一些子元素，并且还有一个很奇怪的标记：`#shadow-root (user-agent)`，这就意味着当前的标签是基于 Shadow DOM 实现的。

## 一些基本了解

> 以下内容摘自 MDN

本文假设你已经熟悉 DOM（文档对象模型）的概念——一种连接节点的树状结构，代表标记文档（通常是在 web 文档中的 HTML 文档）中出现的不同元素和文本字符串。作为示例，请考虑以下 HTML 片段：

```html
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>DOM 示例</title>
  </head>
  <body>
    <section>
      <img src="dinosaur.png" alt="一个红色的霸王龙。" />
      <p>
        这里我们将添加一个到
        <a href="https://www.mozilla.org/">Mozilla 主页</a>的链接
      </p>
    </section>
  </body>
</html>
```

这个片段生成了以下的 DOM 结构（不包括仅包含空格的文本节点）：

```
- HTML
    - HEAD
        - META charset="utf-8"
        - TITLE
            - #text: DOM 示例
    - BODY
        - SECTION
            - IMG src="dinosaur.png" alt="一个红色的霸王龙。"
            - P
                - #text: 这里我们将添加一个到
                - A href="https://www.mozilla.org/"
                - #text: Mozilla 主页
                - #text: 的链接
```

影子 DOM 允许将隐藏的 DOM 树附加到常规 DOM 树中的元素上——这个影子 DOM 始于一个影子根，在其之下你可以用与普通 DOM 相同的方式附加任何元素。

有一些影子 DOM 术语需要注意：

- **影子宿主（Shadow host）**：影子 DOM 附加到的常规 DOM 节点。
- **影子树（Shadow tree）**：影子 DOM 内部的 DOM 树。
- **影子边界（Shadow boundary）**：影子 DOM 终止，常规 DOM 开始的地方。
- **影子根（Shadow root）**：影子树的根节点。

你可以用与非影子节点完全相同的方式来影响影子 DOM 中的节点——例如添加子节点和设置属性、使用 `element.style.foo` 对单个节点进行样式设置，或将整个影子树内的样式添加到一个 `<style>` 元素中。不同之处在于影子 DOM 内的所有代码都不会影响它的外部，从而便于实现封装。

## 创建一个 Shadow DOM

要想创建一个 Shadow DOM，必须依赖于某个宿主节点（也就是上文说的影子宿主 Shadow host），通过调用宿主上的 `attachShadow()` 来创建 Shadow DOM。

```js
const host = document.querySelector("#host");
const shadow = host.attachShadow({ mode: "open" });
const span = document.createElement("span");
span.textContent = "I'm in the shadow DOM";
shadow.appendChild(span);
```

调用 `attachShadow()` 必须传入一个参数 `mode`，该参数的含义是外部是否可以利用 JS 通过影子宿主的 `shadowRoot` 属性访问 Shadow DOM 的内部。需要注意的是：`mode` 仅仅控制的是能否访问到 `shadowRoot`，而不是 Shadow DOM 的内部节点（无论如何外部都不能直接获取 Shadow DOM 的内部节点）：

```js
const openEl = document.querySelector("my-open");
// 区别在于能否获取宿主元素的 shadowRoot，如果为 closed，返回值为 null
console.log("openEl.shadowRoot:", openEl.shadowRoot);
```

然而，你不应将这视为一个强大的安全机制，因为它可以被绕过，比如通过在页面中运行的浏览器扩展。这更多地是一个指示页面不应访问影子 DOM 树内部的一种提示。**强烈建议使用 `open`**：

```js
customElements.define(
  "x-element",
  class extends HTMLElement {
    constructor() {
      super();
      this._shadowRoot = this.attachShadow({ mode: "closed" });
      this._shadowRoot.innerHTML = '<div class="wrapper"></div>';
    }
    connectedCallback() {
      // 必须通过存储的引用才能访问影子根内部元素，完全多此一举
      const wrapper = this._shadowRoot.querySelector(".wrapper");
    }
  }
);
```

有些元素无法挂载 `shadowRoot`，条件大概如下：

1. 浏览器已经为其元素（`<textarea>`、`<input>`）托管了自己的内部阴影 DOM。
2. 对于元素来说，挂载一个阴影 DOM（`<img>`）是没有意义的。

## 样式隔离

大部分人了解 Shadow DOM 都是从样式隔离开始的。得益于 Shadow host 和 Shadow root 之间存在 Shadow boundary，影子边界保证主 DOM 写的 CSS 选择器和 JavaScript 代码都不会影响到 Shadow DOM，当然也保护主文档不受 Shadow DOM 样式的侵袭。

一般有两种方法在 Shadow DOM 中应用样式（来源于 MDN）：

- **编程式**：通过构建一个 `CSSStyleSheet` 对象并将其附加到影子根。
- **声明式**：通过在一个 `<template>` 元素的声明中添加一个 `<style>` 元素。

针对使用编程式构建 `CSSStyleSheet`，实际上也有通过 `innerHTML` 的方式，并且效果一样。顺便提一下针对 `innerHTML` 和 `<template>` 对比的讨论。

### 可构造样式表

要使用可构造样式表为影子 DOM 中的页面元素设置样式，我们可以：

1. 创建一个空的 `CSSStyleSheet` 对象
2. 使用 `CSSStyleSheet.replace()` 或 `CSSStyleSheet.replaceSync()` 设置其内容
3. 通过将其赋给 `ShadowRoot.adoptedStyleSheets` 来添加到影子根

在 `CSSStyleSheet` 中定义的规则将局限在影子 DOM 树的内部，以及我们将其分配到的任何其它 DOM 树。

```js
const sheet = new CSSStyleSheet();
sheet.replaceSync("span { color: red; border: 2px dotted black;}");

const host = document.querySelector("#host");

const shadow = host.attachShadow({ mode: "open" });
shadow.adoptedStyleSheets = [sheet];

const span = document.createElement("span");
span.textContent = "I'm in the shadow DOM";
shadow.appendChild(span);
```

### 在 `<template>` 声明中添加 `<style>` 元素

构建 `CSSStyleSheet` 对象的一个替代方法是将一个 `<style>` 元素包含在用于定义 web 组件的 `<template>` 元素中。

在这种情况下，HTML 包含 `<template>` 声明：

```html
<template id="my-element">
  <style>
    span {
      color: red;
      border: 2px dotted black;
    }
  </style>
  <span>I'm in the shadow DOM</span>
</template>

<div id="host"></div>
<span>I'm not in the shadow DOM</span>
```

在 JavaScript 中，我们将创建影子 DOM 并将 `<template>` 的内容添加到其中：

```js
const host = document.querySelector("#host");
const shadow = host.attachShadow({ mode: "open" });
const template = document.getElementById("my-element");

shadow.appendChild(template.content);
```

同样地，在 `<template>` 中定义的样式局限在影子 DOM 树内，而不是在页面的其它部分。

## 如何穿透 Shadow DOM

### 1. `part` / `::part()`

这是为"组件样式定制"专门设计的。

组件内部：

```html
<button part="button">OK</button>
```

外部样式：

```css
my-button::part(button) {
  background: red;
}
```

### 2. CSS 自定义属性（CSS Variables）

CSS 变量是**继承的**，可以穿过 shadow boundary。同时也意味着可继承样式（背景、颜色、字体、行高等）在 Shadow DOM 中会继续继承——它们默认会穿透 Shadow DOM 的边界。如果希望从全新的样式状态开始，可在样式跨越 Shadow 边界时使用 `all: initial;` 将可继承样式重置为初始值。

### 3. `:host` / `:host()`

我个人认为这其实不算样式穿透，本质上是一种受控的实现，借助 host 选择器与外界进行联系。这是 Shadow DOM 内部用的选择器。

```css
:host {
  display: inline-block;
}

:host([disabled]) {
  opacity: 0.5;
}
```

外部：

```html
<my-button disabled></my-button>
```

外部不穿透，而是**组件主动暴露状态**。

### 4. `::slotted()`

`::slotted()` 是 Shadow DOM 内部才能用的伪元素选择器，用来给从外部"投影"进来的节点（slotted content）加样式。参数只能是**简单选择器**（simple selector），不能是复杂后代/子代组合。

由于 slotted 的内容仍然属于 light DOM，所以外部 CSS 当然能影响它。

### 在编程式和声明式中选择

使用哪种方式取决于你的应用程序和个人喜好。

创建一个 `CSSStyleSheet` 并通过 `adoptedStyleSheets` 将其赋给影子根，允许你创建单一样式表并将其与多个 DOM 树共享。例如，一个组件库可以创建单个样式表，然后将其与该库的所有自定义元素共享。浏览器将仅解析该样式表。此外，你可以对样式表进行动态更改，并将更改传播到使用表的所有组件。

而当你希望是声明式的、需要较少的样式并且不需要在不同组件之间共享样式的时候，附加 `<style>` 元素的方法则非常适合。

## 事件处理

为了保持事件模型的自然性，文档可以监听那些在 Shadow DOM 子树中触发的事件。例如，当你点击音频元素内部的静音按钮时，绑定在外层 div 上的事件监听器同样可以接收到这个点击事件。

不过，如果你试图判断"究竟是哪个元素触发了该事件"，就会发现事件的目标并不是 Shadow DOM 内部的某个按钮，而是音频元素本身。这是因为事件在跨越 Shadow DOM 边界时会被**重新定位（retarget）**，从而避免将阴影子树的内部实现细节暴露给外部代码。

### 关于 `composed`

在 Shadow DOM 外部，会发现有些事件能够监听到，有些则不能。这是因为原生事件的 `composed` 属性——事件能否"穿出" Shadow DOM，取决于 `composed`：`composed: true` 意味着可以跨越 shadow boundary，反之则不能。

常见原生事件的 `composed` 属性：

| 事件                         | `composed` |
| ---------------------------- | ---------- |
| `click`                      | `true`     |
| `input`                      | `true`     |
| `change`                     | `true`     |
| `focus` / `blur`             | `false`    |
| `mouseenter` / `mouseleave`  | `false`    |

当事件从 Shadow DOM 内部冒泡到外部时，`event.target` 会被重定向为 shadow host（宿主元素）。如果你真的需要知道事件的完整来源，可以用 `event.composedPath()`：

```js
el.addEventListener("click", (e) => {
  console.log(e.composedPath());
});
```

### 关于 Focus

当焦点发生在 Shadow DOM 内部元素（如 `<input>`）上时：

- 在 Shadow DOM **内部**监听事件，可以获得真实的焦点元素
- 在 Shadow DOM **外部**（如宿主元素或 `document`）监听事件时：
  - `event.target` 会被重定向为 shadow host
  - `document.activeElement` 也会指向 shadow host

这是之前提到的重新定位（retarget）。如果想要获取真实获得焦点的内部元素，需要 shadow root 使用的是 `mode: 'open'`：

```js
document.activeElement.shadowRoot.activeElement;
```

当存在多层嵌套的 Shadow DOM 时，需要递归查找：

```js
function deepActiveElement() {
  let el = document.activeElement;
  while (el && el.shadowRoot && el.shadowRoot.activeElement) {
    el = el.shadowRoot.activeElement;
  }
  return el;
}
```

### 关于 `delegatesFocus`

在创建 shadow root 时：

```js
this.attachShadow({ mode: "open", delegatesFocus: true });
```

启用 `delegatesFocus` 会改变焦点行为，使组件更接近原生控件：

- 点击 Shadow DOM 中**不可聚焦区域**时，焦点会自动委托给内部第一个可聚焦元素
- 内部元素获得焦点时，`:focus` 状态同时作用于 shadow host
- Tab 导航或 `focus()` 调用时，焦点更自然地进入组件内部

当未启用 `delegatesFocus` 时：

- 点击不可聚焦区域不会自动将焦点送入内部输入
- 内部元素聚焦时，host 不一定处于 `:focus` 状态
- 若希望 host 可聚焦，需显式设置 `tabindex`

举个例子，假设组件结构是：

```html
<x-input></x-input>
```

```js
class XInput extends HTMLElement {
  constructor() {
    super();
    this.tabIndex = 0;
    this.attachShadow({ mode: "open", delegatesFocus: true });
    this.shadowRoot.innerHTML = `
      <input placeholder="inner input">
    `;
  }
}
```

调用 `host.focus()`：

```js
document.querySelector("x-input").focus();
```

- **没有 `delegatesFocus`（默认）**：焦点会停在 `<x-input>` 上，内部 `<input>` 不会自动获得焦点，用户看不到光标（除非你手动 focus 内部）。
- **开启 `delegatesFocus`**：浏览器发现 host 聚焦了，检查 shadow DOM 是否存在可聚焦元素，如果有就把焦点"委托"给第一个可聚焦元素，内部 `<input>` 获得焦点（光标出现）。

## 自定义元素

前文说过的音频标签（`<audio>`）、视频标签（`<video>`）本质上都是自定义元素，与 Shadow DOM 关系密切。如果没有影子 DOM 提供的封装，自定义元素将变得无法使用。只需在某个页面上运行一些 JavaScript 或 CSS，就有可能无意间破坏自定义元素的行为或布局。作为自定义元素的开发者，你将无法知道适用于自定义元素内部的选择器是否与使用你自定义元素的页面中应用的选择器发生冲突——所以可以理解为 Shadow DOM 为自定义元素提供了一个独立的环境。

自定义元素被实现为一个类，它可以继承 `HTMLElement` 或像 `HTMLParagraphElement` 这样的内置 HTML 元素。通常，自定义元素本身是一个影子宿主，该元素在其根节点下创建多个元素，以提供元素的内部实现。

下面的示例创建了一个 `<filled-circle>` 自定义元素，该元素仅渲染一个填充了实心颜色的圆形：

```js
class FilledCircle extends HTMLElement {
  constructor() {
    super();
  }
  connectedCallback() {
    const shadow = this.attachShadow({ mode: "open" });

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const circle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle"
    );
    circle.setAttribute("cx", "50");
    circle.setAttribute("cy", "50");
    circle.setAttribute("r", "50");
    circle.setAttribute("fill", this.getAttribute("color"));
    svg.appendChild(circle);

    shadow.appendChild(svg);
  }
}

customElements.define("filled-circle", FilledCircle);
```

## 关于 Slot

理解 slot 必须分清三棵树：

### A. Light DOM（用户写的 DOM）

用户写在组件标签内部的子节点，例如：

```html
<fancy-tabs>
  <button slot="title">Title</button>
  <section>panel 1</section>
</fancy-tabs>
```

这些节点是**组件外部**的 DOM（仍属于主文档树），叫 light DOM children。

### B. Shadow DOM（组件内部 DOM）

组件作者在构造函数里 `attachShadow`，并写内部结构，例如：

```html
<div id="tabs"><slot name="title"></slot></div>
<div id="panels"><slot></slot></div>
```

这是组件内部的 DOM。

### C. Flattened / Composed Tree

浏览器渲染与事件分发时，实际使用的是一棵"组合后的树"（Render Tree）：

- 以 shadow DOM 的结构为骨架
- 把 light DOM 的节点按 slot 分配规则"投影"到对应 slot 位置

**关键**：最终渲染、布局、hit-test、事件路径，很多时候都按 composed tree 来理解。

需要注意的是 **Slots 并不意味着移动 DOM**。举个例子来说：

这个 `<button>`：

```html
<button slot="title">Title</button>
```

在 DOM 结构上依然是 `<fancy-tabs>` 的子节点：

```js
tabsEl.children; // 仍能看到 button/section
```

但它**显示的位置**却在 shadow DOM 的 `<slot name="title">` 那里。这意味着：

- 外部依然可以 `querySelector` 找到它（它仍在 light DOM）
- 组件内部可以通过 slot API 获取它（它被"分配"进来了）
- 但外部 CSS 不能直接选择 shadow 内部节点（封装仍存在）

### `slot.assignedNodes()`

有时，了解哪些元素与某个插槽相关联是很有用的。你可以调用 `slot.assignedNodes()` 方法，来查找该插槽正在渲染的元素。若传入配置项 `{ flatten: true }`，当没有元素被分发到插槽时，该方法还会返回插槽的后备内容。

举个例子，假设你的影子 DOM 结构如下：

```html
<slot><b>fallback content</b></slot>
```

不同使用场景下的调用结果对比：

| 组件使用方式 | 方法调用 | 返回结果 |
| --- | --- | --- |
| `<my-component>component text</my-component>` | `slot.assignedNodes()` | `[component text]`（组件传入的文本节点） |
| `<my-component></my-component>` | `slot.assignedNodes()` | `[]`（空数组，无传入元素） |
| `<my-component></my-component>` | `slot.assignedNodes({ flatten: true })` | `[<b>fallback content</b>]`（插槽的后备内容） |

### 反向查询：元素被分配到哪个插槽？

我们也可以进行反向查询——`element.assignedSlot` 属性会告诉你，当前元素被分配到了组件的哪一个插槽中。

## 参考资料

- [What the Heck is Shadow DOM? - Dimitri Glazkov](https://glazkov.com/2011/01/14/what-the-heck-is-shadow-dom/)
- [Shadow DOM 使用详解 - 京东凹凸实验室](https://jelly.jd.com/article/6006b1045b6c6a01506c87ac)
- [使用 Shadow DOM - MDN](https://developer.mozilla.org/zh-CN/docs/Web/API/Web_components/Using_shadow_DOM)
- [Shadow DOM v1 - web.dev](https://web.dev/articles/shadowdom-v1#terminology_light_dom_vs_shadow_dom)
