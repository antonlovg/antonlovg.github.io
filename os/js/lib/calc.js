// A pocket calculator in the classic style: 12 + 3 = 15, operators chain left to right,
// pressing = again repeats the last operation.

export function createCalculator() {
  return { display: '0', stored: null, op: null, fresh: true, last: null, error: false, memory: 0 };
}

const OPS = { '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b, '/': (a, b) => (b === 0 ? NaN : a / b) };

export function format(value) {
  if (!Number.isFinite(value)) return 'Cannot divide by zero';
  const rounded = Number.parseFloat(value.toPrecision(12));
  const text = String(rounded);
  return text.length > 16 ? rounded.toExponential(8) : text;
}

const valueOf = calc => Number.parseFloat(calc.display);

function apply(calc, a, op, b) {
  const result = OPS[op](a, b);
  calc.display = format(result);
  calc.error = !Number.isFinite(result);
  return result;
}

// key: a digit, '.', '+', '-', '*', '/', '=', 'C' (clear), 'CE', 'back', 'neg', '%', 'sqrt', '1/x', 'MC', 'MR', 'MS', 'M+'.
export function press(calc, key) {
  if (calc.error && key !== 'C') return calc;
  if (/^\d$/.test(key)) {
    calc.display = calc.fresh || calc.display === '0' ? key : (calc.display.length < 16 ? calc.display + key : calc.display);
    calc.fresh = false;
  } else if (key === '.') {
    if (calc.fresh) { calc.display = '0.'; calc.fresh = false; } else if (!calc.display.includes('.')) calc.display += '.';
  } else if (key in OPS) {
    if (calc.op && !calc.fresh) calc.stored = apply(calc, calc.stored, calc.op, valueOf(calc));
    else calc.stored = valueOf(calc);
    calc.op = key;
    calc.fresh = true;
    calc.last = null;
  } else if (key === '=') {
    if (calc.op) {
      const operand = calc.fresh && calc.last ? calc.last.operand : valueOf(calc);
      const base = calc.fresh && calc.last ? valueOf(calc) : calc.stored;
      calc.last = { op: calc.op, operand };
      apply(calc, base, calc.op, operand);
      calc.stored = null;
      calc.op = null;
    } else if (calc.last) {
      apply(calc, valueOf(calc), calc.last.op, calc.last.operand);
    }
    calc.fresh = true;
  } else if (key === 'C') {
    Object.assign(calc, createCalculator(), { memory: calc.memory });
  } else if (key === 'CE') {
    calc.display = '0';
    calc.fresh = true;
  } else if (key === 'back') {
    if (!calc.fresh) calc.display = calc.display.length > 1 ? calc.display.slice(0, -1) : '0';
    if (calc.display === '-') calc.display = '0';
  } else if (key === 'neg') {
    if (calc.display !== '0') calc.display = calc.display.startsWith('-') ? calc.display.slice(1) : `-${calc.display}`;
  } else if (key === '%') {
    calc.display = format((calc.stored ?? 0) * valueOf(calc) / 100);
    calc.fresh = true;
  } else if (key === 'sqrt') {
    const v = valueOf(calc);
    calc.display = v < 0 ? 'Invalid input' : format(Math.sqrt(v));
    calc.error = v < 0;
    calc.fresh = true;
  } else if (key === '1/x') {
    apply(calc, 1, '/', valueOf(calc));
    calc.fresh = true;
  } else if (key === 'MC') calc.memory = 0;
  else if (key === 'MR') { calc.display = format(calc.memory); calc.fresh = true; }
  else if (key === 'MS') { calc.memory = valueOf(calc); calc.fresh = true; }
  else if (key === 'M+') { calc.memory += valueOf(calc); calc.fresh = true; }
  return calc;
}
