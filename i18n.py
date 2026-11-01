"""Server-side texts in Russian (the source) or English, picked per request from the X-Lang header.

tr("Russian template {x}", x=…) looks the template up in EN when the request is English; Russian is the key,
so code reads as before and a missing translation falls back to Russian."""

from contextvars import ContextVar

LANGS = ("ru", "en")
_lang: ContextVar[str] = ContextVar("lang", default="ru")


def set_lang(lang: str | None):
    _lang.set(lang if lang in LANGS else "ru")


def get_lang() -> str:
    return _lang.get()


def tr(ru: str, **kw) -> str:
    s = EN.get(ru, ru) if _lang.get() == "en" else ru
    return s.format(**kw) if kw else s


EN = {
    # technique titles and grades (sudoku_core)
    "Голая одиночка (Naked Single)": "Naked Single",
    "Скрытая одиночка в блоке (Hidden Single)": "Hidden Single in a box",
    "Скрытая одиночка в строке (Hidden Single)": "Hidden Single in a row",
    "Скрытая одиночка в столбце (Hidden Single)": "Hidden Single in a column",
    "Указывающая пара (Pointing)": "Pointing",
    "Захват (Claiming)": "Claiming",
    "Голая пара (Naked Pair)": "Naked Pair",
    "Скрытая пара (Hidden Pair)": "Hidden Pair",
    "одиночки": "singles",
    "+ пары": "+ pairs",
    "сложнее": "harder",
    "строка {n}": "row {n}",
    "столбец {n}": "column {n}",
    "блок {n}": "box {n}",
    # drill prompts
    "Найди клетку, где остался один кандидат (naked single)": "Find the cell with a single candidate left (naked single)",
    "Найди скрытую одиночку (hidden single) в блоке": "Find the hidden single in a box",
    "Найди скрытую одиночку (hidden single) в строке": "Find the hidden single in a row",
    "Найди скрытую одиночку (hidden single) в столбце": "Find the hidden single in a column",
    "Найди кандидата, которого убирает указывающая пара (pointing)": "Find a candidate removed by pointing",
    "Найди кандидата, которого убирает захват (claiming)": "Find a candidate removed by claiming",
    "Найди кандидата, которого убирает голая пара (naked pair)": "Find a candidate removed by a naked pair",
    "Найди кандидата, которого убирает скрытая пара (hidden pair)": "Find a candidate removed by a hidden pair",
    "Найди кандидата, которого убирает X-Wing": "Find a candidate removed by an X-Wing",
    "Найди кандидата, которого убирает Y-Wing": "Find a candidate removed by a Y-Wing",
    "Найди ход: {title}": "Find the move: {title}",
    # drill explanations and hints (drills)
    "строке {n}": "row {n}",
    "столбце {n}": "column {n}",
    "блоке {n}": "box {n}",
    "{v} из {cells}": "{v} from {cells}",
    "В {cell} остался один кандидат — {v}: остальные цифры уже стоят в её строке, столбце или блоке.": "{cell} has one candidate left — {v}: every other digit is already in its row, column or box.",
    "В {unit} цифра {v} может стоять только в {cell}.": "In {unit}, {v} can only go in {cell}.",
    "этой строке": "this row",
    "этом столбце": "this column",
    "В {unit} цифра {v} может стоять только в {line} ({cells}). Значит, в {this} вне блока {v} быть не может → убираем {elims}.": "In {unit}, {v} can only go in {line} ({cells}). So {v} cannot be in {this} outside the box → remove {elims}.",
    "В {unit} цифра {v} может стоять только внутри блока {box} ({cells}). Значит, в остальных клетках блока {box} её быть не может → убираем {elims}.": "In {unit}, {v} can only go inside box {box} ({cells}). So it cannot be in the other cells of box {box} → remove {elims}.",
    "В {unit} клетки {a} и {b} содержат только {x} и {y} — эти две цифры займут именно их → убираем {elims}.": "In {unit}, cells {a} and {b} hold only {x} and {y} — these two digits will take exactly them → remove {elims}.",
    "В {unit} цифры {x} и {y} могут стоять только в {a} и {b} → эти клетки заняты ими, остальные кандидаты оттуда убираем: {elims}.": "In {unit}, {x} and {y} can only go in {a} and {b} → those cells are theirs, remove the other candidates there: {elims}.",
    "строках {a} и {b}": "rows {a} and {b}",
    "столбцах {a} и {b}": "columns {a} and {b}",
    "В {base} цифра {v} может стоять только в {cover} (углы: {cells}). В каждой из этих линий {v} займёт один из углов → убираем {elims}.": "In {base}, {v} can only go in {cover} (corners: {cells}). In each of these lines {v} takes one of the corners → remove {elims}.",
    "Опора {p} видит крылья {a} и {b}. Что бы ни встало в опору, в одном из крыльев окажется {v} → {v} нельзя там, где клетка видит оба крыла: убираем {elims}.": "Pivot {p} sees wings {a} and {b}. Whatever goes into the pivot, one of the wings gets {v} → {v} is impossible where a cell sees both wings: remove {elims}.",
    "{title}: убираем {elims}.": "{title}: remove {elims}.",
    " (Здесь таких ходов {n}, засчитывается любой.)": " (There are {n} such moves here; any of them counts.)",
    "Смотри в {unit}: там есть пустая клетка, где строка, столбец и блок уже закрыли все цифры, кроме одной.": "Look in {unit}: there is an empty cell where the row, column and box already rule out every digit but one.",
    "Смотри в {unit}: одной из недостающих цифр там осталось только одно место. Для каждой недостающей цифры вычеркни клетки, которые она «видит».": "Look in {unit}: one of the missing digits has only one place left there. For each missing digit, cross out the cells it “sees”.",
    "Смотри цифру {d} в {unit}: внутри блока она возможна только на одной линии.": "Look at {d} in {unit}: inside the box it is only possible on one line.",
    "Смотри цифру {d} в {unit}: в этой линии она возможна только внутри одного блока.": "Look at {d} in {unit}: on this line it is only possible inside one box.",
    "Смотри в {unit}: у двух клеток там одна и та же пара кандидатов.": "Look in {unit}: two cells there have the same pair of candidates.",
    "Смотри в {unit}: две цифры там возможны только в двух одних и тех же клетках.": "Look in {unit}: two digits there are possible only in the same two cells.",
    "Смотри цифру {d}: найди две строки (или два столбца), где она возможна ровно в двух одинаковых позициях — получится прямоугольник.": "Look at {d}: find two rows (or two columns) where it is possible in exactly the same two positions — they form a rectangle.",
    "Опора — {cell} ({x}/{y}). Найди две клетки-крыла, которые она видит: у каждой два кандидата, один общий с опорой, а второй — одинаковый у обоих крыльев.": "The pivot is {cell} ({x}/{y}). Find two wing cells it sees: each has two candidates, one shared with the pivot, the other the same in both wings.",
    "Ищи: {title}.": "Look for: {title}.",
    # API errors (server)
    "поле {key} обязательно": "field {key} is required",
    "поле {key} должно быть целым числом": "field {key} must be an integer",
    "поле {key} вне диапазона": "field {key} is out of range",
    "в избранном нет задач": "no puzzles in favourites",
    "неизвестный уровень: {level}": "unknown level: {level}",
    "grade должен быть 1..5": "grade must be 1..5",
    "нет задач с такими параметрами": "no puzzles match these settings",
    "поле givens обязательно": "field givens is required",
    "нет решения": "no solution",
    "решение не единственное": "the solution is not unique",
    "mode должен быть original или hardcore": "mode must be original or hardcore",
    "задача не найдена": "puzzle not found",
    "задача дня играется в hardcore": "the daily puzzle is played in hardcore",
    "это не задача дня": "this is not today's daily puzzle",
    "партия не найдена": "game not found",
    "ход должен быть объектом": "a move must be an object",
    "неизвестный тип хода: {kind}": "unknown move type: {kind}",
    "поле moves должно быть списком": "field moves must be a list",
    "status должен быть solved, failed или abandoned": "status must be solved, failed or abandoned",
    "в избранном нет упражнений": "no drills in favourites",
    "упражнений нет": "no drills",
    "упражнение не найдено": "drill not found",
    "в избранное можно добавить только: {kinds}": "only these can be favourites: {kinds}",
    "puzzles и drills должны быть списками объектов": "puzzles and drills must be lists of objects",
    "страница теории не найдена": "theory page not found",
    "некорректный JSON": "invalid JSON",
    "тело запроса должно быть JSON-объектом": "the request body must be a JSON object",
    "нет такого маршрута: {method} {path}": "no such route: {method} {path}",
    "внутренняя ошибка: {e}": "internal error: {e}",
    "файл не найден": "file not found",
    "не найдено": "not found",
    "нужно 81 клетку, получено {n}": "81 cells needed, got {n}",
    "неизвестная техника: {t}": "unknown technique: {t}",
    # hint ladder and solve line (hints.py)
    "Следующий ход: {title}.": "Next move: {title}.",
    "Клетка — {cell}: какая цифра ей осталась?": "The cell is {cell}: which digit is left for it?",
    "Ищи место для цифры {v} в {unit}.": "Find the spot for {v} in {unit}.",
    "Узор: {cells}, цифра {d}.": "Pattern: {cells}, digit {d}.",
    "Это даёт: {cell} = {v}.": "This gives: {cell} = {v}.",
    "На доске неверных цифр: {n}. Пока они стоят, логика не сходится.": "Wrong digits on the board: {n}. While they stay, the logic won't work out.",
    "Неверные цифры: {cells}. Сотри их.": "Wrong digits: {cells}. Erase them.",
    "Ошибка на доске": "Mistake on the board",
    "В заметках вычеркнута верная цифра — из-за этого ход не находится.": "A right digit is missing from your notes — that's why no move shows up.",
    "в {cell} нет заметки {v}": "{cell} lacks the note {v}",
    "Ошибка в заметках": "Mistake in the notes",
    "Позиция решена.": "Position solved.",
    "Решено": "Solved",
    "Одиночки, пересечения, пары, X-Wing и Y-Wing здесь хода не дают — нужна техника сложнее.": "Singles, intersections, pairs, X-Wing and Y-Wing give no move here — a harder technique is needed.",
    "Цифра из решения: {cell} = {v}.": "Digit from the solution: {cell} = {v}.",
    "Нужна техника сложнее": "A harder technique is needed",
    "Цифра из решения": "Digit from the solution",
    "Логикой хода нет — цифра из решения: {cell} = {v}.": "No logical move — digit from the solution: {cell} = {v}.",
}
