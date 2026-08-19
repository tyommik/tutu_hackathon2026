import { describe, expect, it } from "vitest";
import { renderLightMarkdown } from "./lightMarkdown";

describe("renderLightMarkdown — форматирование", () => {
  it("акценты, код и зачёркнутый", () => {
    const html = renderLightMarkdown("**жирный** и *курсив*, `код`, ~~старая цена~~");
    expect(html).toContain("<strong>жирный</strong>");
    expect(html).toContain("<em>курсив</em>");
    expect(html).toContain("<code>код</code>");
    expect(html).toContain("<del>старая цена</del>");
  });

  it("списки, в том числе вложенные и нумерованные", () => {
    const html = renderLightMarkdown("1. Москва\n2. Стамбул\n  - отель\n  - музей");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>Москва");
    expect(html).toContain("<ul><li>отель</li><li>музей</li></ul>");
  });

  it("таблица маршрута", () => {
    const html = renderLightMarkdown("| Плечо | Цена |\n| --- | --- |\n| Оскол → Москва | 3 075 ₽ |");
    expect(html).toContain('<table class="md-table">');
    expect(html).toContain("<th>Плечо</th>");
    expect(html).toContain("<td>3 075 ₽</td>");
  });

  it("заголовки, цитаты, блок кода и разделитель", () => {
    const html = renderLightMarkdown("## План\n> совет\n---\n```\nnpm run dev\n```");
    expect(html).toContain("<h2>План</h2>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<hr/>");
    expect(html).toContain('<pre class="md-code"><code>npm run dev</code></pre>');
  });

  it("переносы строк внутри абзаца", () => {
    expect(renderLightMarkdown("первая\nвторая")).toContain("<br/>");
  });
});

describe("renderLightMarkdown — безопасность", () => {
  it("HTML из ответа модели экранируется", () => {
    const html = renderLightMarkdown('<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("ссылки с опасной схемой не превращаются в <a>", () => {
    expect(renderLightMarkdown("[клик](javascript:alert(1))")).not.toContain("<a ");
    expect(renderLightMarkdown("[клик](javascript&#x9;:alert(1))")).not.toContain("<a ");
  });

  it("нормальная ссылка открывается безопасно", () => {
    const html = renderLightMarkdown("[Туту](https://www.tutu.ru/poezda/)");
    expect(html).toContain('href="https://www.tutu.ru/poezda/"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("markdown внутри inline-кода не исполняется", () => {
    expect(renderLightMarkdown("`**не жирный**`")).toContain("<code>**не жирный**</code>");
  });
});
