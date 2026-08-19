// Лёгкий markdown-рендер без внешних зависимостей (перенесён из Trivio).
// Поддерживает: переносы строк, markdown-таблицы, заголовки (#…######), списки (-/*/+, 1./1)),
// fenced-блоки кода (``` без подсветки), цитаты (>), горизонтальные линии (---/***/___),
// ссылки [text](url), **жирный**/__жирный__, *курсив*/_курсив_, ~~зачёркнутый~~, `inline code`.
// Backslash-экранирование (\*, \`, …) и валидные HTML-сущности (&amp; &copy; &#169;) сохраняются.
// При необходимости заменяется на markdown-it + DOMPurify.

// Строгое экранирование для кода — всё «как есть», сущности не раскрываются
const escapeCode = (text: string): string =>
    text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

// Экранирование обычного текста: одиночный «&» экранируем, но валидные сущности (&amp; &copy; &#169; &#x20AC;) сохраняем
const escapeHtml = (text: string): string =>
    text
        .replace(/&(?![a-zA-Z][a-zA-Z0-9]*;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

// Разрешённые схемы ссылок; без схемы (относительная/якорная ссылка) — тоже безопасно
const SAFE_URL_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

// Именованные HTML-сущности, которыми можно спрятать разделитель схемы или пробел
const HTML_ENTITY_MAP: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    colon: ':',
    tab: '\t',
    newline: '\n',
    nbsp: ' ',
};

// url приходит уже HTML-экранированным; браузер декодирует href обратно, поэтому «эффективный»
// адрес считаем по раскодированным сущностям (иначе `javascript&#x9;:` обходит проверку схемы)
const decodeHtmlEntities = (value: string): string =>
    value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string): string => {
        if (body[0] === '#') {
            const isHex = body[1] === 'x' || body[1] === 'X';
            const codePoint = isHex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);

            if (Number.isNaN(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
                return whole;
            }

            try {
                return String.fromCodePoint(codePoint);
            }
            catch {
                return whole;
            }
        }

        return HTML_ENTITY_MAP[body.toLowerCase()] ?? whole;
    });

// Разрешаем ссылку только с безопасной схемой. Браузер при резолве URL декодирует сущности и
// отбрасывает ведущие управляющие символы/пробелы (коды ≤ 0x20), поэтому схему проверяем именно
// на таком «эффективном» адресе — иначе трюки `\x01javascript:` / `javascript&#x9;:` дают XSS в v-html.
const sanitizeUrl = (url: string): string | null => {
    const effective = Array.from(decodeHtmlEntities(url))
        .filter((char) => char.charCodeAt(0) > 0x20)
        .join('');

    if (!effective) {
        return null;
    }

    const scheme = effective.match(/^([a-z][a-z0-9+.-]*):/i);

    if (scheme && !SAFE_URL_SCHEMES.has(scheme[1].toLowerCase())) {
        return null;
    }

    return url;
};

// Инлайн-акценты: зачёркнутый, жирный, курсив (обе нотации). Порядок важен — сперва парные звёздочки/подчёркивания
const applyEmphasis = (html: string): string =>
    html
        .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
        .replace(/(^|[^\w_])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');

const renderInlineMarkdown = (raw: string): string => {
    // Замороженные фрагменты (экранированные символы, код, ссылки) — их не трогают акценты
    const frozen: string[] = [];
    const freeze = (replacement: string): string => {
        const token = ` FROZEN${frozen.length} `;
        frozen.push(replacement);

        return token;
    };

    // Работаем на сыром тексте: код экранируем «как есть», а сущности обычного текста сохраняем ниже
    let text = raw;

    // Backslash-экранирование: \X (ASCII-пунктуация) → литеральный X без markdown-разметки
    text = text.replace(/\\([!"#$%&'()*+,\-.\/:;<=>?@[\]^_`{|}~\\])/g, (_match, ch: string) => freeze(escapeCode(ch)));

    // Inline code — содержимое вербатим, акценты внутри не работают
    text = text.replace(/`([^`\n]+)`/g, (_match, code: string) => freeze(`<code>${escapeCode(code)}</code>`));

    // Экранируем оставшийся HTML обычного текста (валидные сущности сохраняются)
    let html = escapeHtml(text);

    // Ссылки [text](url); текст форматируем, url оставляем как есть
    html = html.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (match, linkText: string, url: string) => {
        const safeUrl = sanitizeUrl(url);

        if (!safeUrl) {
            return match;
        }

        return freeze(`<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${applyEmphasis(linkText)}</a>`);
    });

    html = applyEmphasis(html);

    // Возвращаем фрагменты с конца: ссылки могут содержать ранее замороженные экранирования/код
    for (let index = frozen.length - 1; index >= 0; index -= 1) {
        html = html.replace(` FROZEN${index} `, () => frozen[index]);
    }

    return html;
};

const splitTableRow = (row: string): string[] => {
    const trimmed = row.trim();
    const withoutEdges = trimmed
        .replace(/^\|/, '')
        .replace(/\|$/, '');

    return withoutEdges.split('|').map(cell => cell.trim());
};

const isTableSeparatorLine = (line: string): boolean => {
    const cells = splitTableRow(line);

    return cells.length > 1 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
};

const isPendingTableSeparatorLine = (line: string): boolean => {
    const trimmed = line.trim();

    if (!trimmed.startsWith('|')) {
        return false;
    }

    const cells = splitTableRow(trimmed);

    return cells.every(cell => /^:?-+:?$/.test(cell));
};

const isTableRow = (line: string): boolean =>
    line.includes('|') && splitTableRow(line).length > 1;

const isPendingTableRow = (line: string): boolean =>
    line.trim().startsWith('|');

const renderParagraph = (lines: string[]): string =>
    lines.map(renderInlineMarkdown).join('<br/>');

// Ограда блока кода: ``` с необязательной меткой языка (метку не используем — без подсветки)
const isCodeFenceLine = (line: string): boolean => line.trim().startsWith('```');

// Содержимое — как есть: только экранирование, без инлайн-markdown, переносы сохраняются
const renderCodeBlock = (lines: string[]): string =>
    `<pre class="md-code"><code>${lines.map(escapeCode).join('\n')}</code></pre>`;

// Горизонтальная линия: 3+ одинаковых символа (-, * или _) c необязательными пробелами
const HORIZONTAL_RULE_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

// Строка цитаты: > с необязательным пробелом; содержимое рендерим рекурсивно
const BLOCKQUOTE_RE = /^ {0,3}>\s?(.*)$/;

// Заголовок: 1–6 решёток + пробел; закрывающие решётки в конце игнорируем
const HEADING_RE = /^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/;

const renderHeading = (match: RegExpMatchArray): string => {
    const level = match[1].length;

    return `<h${level}>${renderInlineMarkdown(match[2])}</h${level}>`;
};

type ListItemLine = {
    depth: number;
    ordered: boolean;
    content: string;
};

type ListNode = {
    ordered: boolean;
    items: Array<{ content: string; children: ListNode[] }>;
};

// Пункт списка: маркер (-/*/+ или число с ./)) + пробел; глубина — по 2 пробела отступа
const parseListItemLine = (line: string): ListItemLine | null => {
    const match = line.match(/^( *)([-*+]|\d{1,9}[.)])\s+(.+)$/);

    if (!match) {
        return null;
    }

    return {
        depth: Math.floor(match[1].length / 2),
        ordered: /\d/.test(match[2]),
        content: match[3],
    };
};

const buildListNode = (items: ListItemLine[], start: number, depth: number): [ListNode, number] => {
    const node: ListNode = { ordered: items[start].ordered, items: [] };
    let index = start;

    while (index < items.length) {
        const item = items[index];

        if (item.depth < depth || (item.depth === depth && item.ordered !== node.ordered)) {
            break;
        }

        if (item.depth > depth) {
            const [child, nextIndex] = buildListNode(items, index, item.depth);
            node.items[node.items.length - 1].children.push(child);
            index = nextIndex;
            continue;
        }

        node.items.push({ content: item.content, children: [] });
        index += 1;
    }

    return [node, index];
};

const renderListNode = (node: ListNode): string => {
    const tag = node.ordered ? 'ol' : 'ul';
    const itemsHtml = node.items
        .map(item => `<li>${renderInlineMarkdown(item.content)}${item.children.map(renderListNode).join('')}</li>`)
        .join('');

    return `<${tag}>${itemsHtml}</${tag}>`;
};

const renderListBlock = (items: ListItemLine[]): string => {
    let html = '';
    let index = 0;

    while (index < items.length) {
        const [node, nextIndex] = buildListNode(items, index, items[index].depth);
        html += renderListNode(node);
        index = nextIndex;
    }

    return html;
};

const renderTable = (lines: string[], showPendingBodyRow = false): string => {
    const [headerLine, , ...bodyLines] = lines;
    const headers = splitTableRow(headerLine);
    const bodyRows = bodyLines
        .filter(line => !isTableSeparatorLine(line) && (isTableRow(line) || isPendingTableRow(line)))
        .map(splitTableRow)
        .map(cells => headers.map((_, index) => cells[index] ?? ''));

    const headHtml = headers
        .map(cell => `<th>${renderInlineMarkdown(cell)}</th>`)
        .join('');
    const rowsToRender = bodyRows.length > 0 || !showPendingBodyRow
        ? bodyRows
        : [headers.map(() => '')];
    const bodyHtml = rowsToRender
        .map(row => `<tr>${row.map(cell => `<td>${renderInlineMarkdown(cell) || '&nbsp;'}</td>`).join('')}</tr>`)
        .join('');

    return [
        '<div class="md-table-wrap">',
        '<table class="md-table">',
        `<thead><tr>${headHtml}</tr></thead>`,
        `<tbody>${bodyHtml}</tbody>`,
        '</table>',
        '</div>',
    ].join('');
};

export const renderLightMarkdown = (raw: string, isStreaming = false): string => {
    if (!raw) {
        return '';
    }

    const lines = raw.split('\n');
    // block: true — блочный элемент (сам переносится на новую строку), false — строчный абзац
    const blocks: Array<{ html: string; block: boolean }> = [];
    let paragraphLines: string[] = [];

    const flushParagraph = () => {
        if (paragraphLines.length === 0) {
            return;
        }

        blocks.push({ html: renderParagraph(paragraphLines), block: false });
        paragraphLines = [];
    };

    for (let index = 0; index < lines.length;) {
        const line = lines[index];
        const nextLine = lines[index + 1] ?? '';

        if (isCodeFenceLine(line)) {
            flushParagraph();

            const codeLines: string[] = [];
            index += 1;

            while (index < lines.length && !isCodeFenceLine(lines[index])) {
                codeLines.push(lines[index]);
                index += 1;
            }

            // Пропускаем закрывающую ограду; незакрытый блок (стриминг) рендерим как есть
            index += 1;
            blocks.push({ html: renderCodeBlock(codeLines), block: true });
            continue;
        }

        const blockquoteMatch = line.match(BLOCKQUOTE_RE);

        if (blockquoteMatch) {
            flushParagraph();

            const innerLines = [blockquoteMatch[1]];
            index += 1;

            let innerMatch = index < lines.length ? lines[index].match(BLOCKQUOTE_RE) : null;

            while (innerMatch) {
                innerLines.push(innerMatch[1]);
                index += 1;
                innerMatch = index < lines.length ? lines[index].match(BLOCKQUOTE_RE) : null;
            }

            blocks.push({ html: `<blockquote>${renderLightMarkdown(innerLines.join('\n'), isStreaming)}</blockquote>`, block: true });
            continue;
        }

        if (HORIZONTAL_RULE_RE.test(line)) {
            flushParagraph();
            blocks.push({ html: '<hr/>', block: true });
            index += 1;
            continue;
        }

        const hasTableSeparator = isTableSeparatorLine(nextLine);
        const hasPendingTableSeparator = isStreaming && isPendingTableSeparatorLine(nextLine);

        if (isTableRow(line) && (hasTableSeparator || hasPendingTableSeparator)) {
            flushParagraph();

            const tableLines = [line, nextLine];
            index += 2;

            while (index < lines.length && (isTableRow(lines[index]) || (isStreaming && isPendingTableRow(lines[index])))) {
                tableLines.push(lines[index]);
                index += 1;
            }

            blocks.push({ html: renderTable(tableLines, isStreaming), block: true });
            continue;
        }

        const headingMatch = line.match(HEADING_RE);

        if (headingMatch) {
            flushParagraph();
            blocks.push({ html: renderHeading(headingMatch), block: true });
            index += 1;
            continue;
        }

        const listItem = parseListItemLine(line);

        if (listItem) {
            flushParagraph();

            const listItems = [listItem];
            index += 1;

            let nextItem = index < lines.length ? parseListItemLine(lines[index]) : null;

            while (nextItem) {
                listItems.push(nextItem);
                index += 1;
                nextItem = index < lines.length ? parseListItemLine(lines[index]) : null;
            }

            blocks.push({ html: renderListBlock(listItems), block: true });
            continue;
        }

        paragraphLines.push(line);
        index += 1;
    }

    flushParagraph();

    // <br/> нужен только между двумя строчными абзацами; блочные элементы (заголовки,
    // списки, код, таблицы, цитаты, hr) уже начинаются с новой строки, лишний перенос убирает зазор
    return blocks
        .map((entry, index) => {
            const needsBreak = index > 0 && !entry.block && !blocks[index - 1].block;

            return (needsBreak ? '<br/>' : '') + entry.html;
        })
        .join('');
};
