/**
 * Предложный падеж названий городов: «в Москва» → «в Москве».
 * Мини-морфология по окончаниям — этого хватает для подписей в плане и для
 * вопросов копилоту. Незнакомое или несклоняемое название возвращаем как есть:
 * лучше именительный падеж, чем выдуманное слово.
 */

/** Несклоняемые окончания: Порту, Осло, Сочи, Баку, Тбилиси, Чебоксары. */
const INDECLINABLE = /[оуеиыэюё]$/i;

function declineWord(word: string): string {
  // прилагательные: Старый Оскол, Нижний Новгород, Грозный
  if (/ый$/i.test(word)) return word.slice(0, -2) + "ом";
  if (/ий$/i.test(word)) return word.slice(0, -2) + "ем";
  if (/ая$/i.test(word)) return word.slice(0, -2) + "ой";

  if (/ия$/i.test(word)) return word.slice(0, -1) + "и"; // Валенсия → Валенсии
  if (/[ая]$/i.test(word)) return word.slice(0, -1) + "е"; // Москва → Москве
  if (/ь$/i.test(word)) return word.slice(0, -1) + "и"; // Казань → Казани
  if (/й$/i.test(word)) return word.slice(0, -1) + "е"; // Дубай → Дубае
  if (INDECLINABLE.test(word)) return word; // Порту, Осло
  if (/[а-яё]$/i.test(word)) return word + "е"; // Стамбул → Стамбуле
  return word; // латиница и всё незнакомое
}

export function prepositional(city: string): string {
  const words = city.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return city;
  return words.map(declineWord).join(" ");
}

/**
 * Винительный падеж для «через X»: «через Варшаву», а не «через Варшава».
 * Меняются только женские окончания -а/-я — мужские и несклоняемые
 * («через Стамбул», «через Порту») совпадают с именительным.
 */
export function accusative(city: string): string {
  return city
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      if (/ая$/i.test(w)) return w.slice(0, -2) + "ую"; // Нижняя → Нижнюю
      if (/ия$/i.test(w)) return w.slice(0, -2) + "ию"; // Валенсия → Валенсию
      if (/я$/i.test(w)) return w.slice(0, -1) + "ю"; // Анталья → Анталью
      if (/а$/i.test(w)) return w.slice(0, -1) + "у"; // Варшава → Варшаву
      return w;
    })
    .join(" ");
}

/** «в Москве», «в Порту» — предлог с падежом одной строкой. */
export function inCity(city: string): string {
  return `в ${prepositional(city)}`;
}
