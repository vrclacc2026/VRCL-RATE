const NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)/;

function parseExpression(source, master) {
  const input = String(source ?? '').trim().toUpperCase().replace(/MASTER\s*RATE/g, 'MASTER');
  if (!input || input.length > 240) return null;
  let index = 0;
  const skip = () => { while (/\s/.test(input[index] || '')) index += 1; };
  const peek = () => { skip(); return input[index] || ''; };
  const take = char => { if (peek() !== char) return false; index += 1; return true; };

  function primary() {
    skip();
    let result;
    if (input.slice(index, index + 6) === 'MASTER') {
      index += 6;
      result = { value: Number(master) || 0, percent: false, variable: true };
    } else if (take('(')) {
      result = additive();
      if (!result || !take(')')) return null;
    } else {
      const match = input.slice(index).match(NUMBER);
      if (!match) return null;
      index += match[0].length;
      result = { value: Number(match[0]), percent: false, variable: false };
    }
    while (take('%')) result = { value: result.value / 100, percent: true, variable: result.variable };
    return result;
  }

  function unary() {
    if (take('+')) return unary();
    if (take('-')) {
      const value = unary();
      return value && { ...value, value: -value.value };
    }
    return primary();
  }

  function multiplicative() {
    let left = unary();
    if (!left) return null;
    while (true) {
      const operator = peek();
      if (operator !== '*' && operator !== '/') break;
      index += 1;
      const right = unary();
      if (!right || (operator === '/' && right.value === 0)) return null;
      const variable = left.variable || right.variable;
      left = {
        value: operator === '*' ? left.value * right.value : left.value / right.value,
        percent: !variable && operator === '*' && (left.percent || right.percent),
        variable
      };
    }
    return left;
  }

  function additive() {
    let left = multiplicative();
    if (!left) return null;
    while (true) {
      const operator = peek();
      if (operator !== '+' && operator !== '-') break;
      index += 1;
      const right = multiplicative();
      if (!right) return null;
      const sign = operator === '+' ? 1 : -1;
      const amount = right.percent && !left.percent ? left.value * right.value : right.value;
      left = {
        value: left.value + sign * amount,
        percent: left.percent && right.percent,
        variable: left.variable || right.variable
      };
    }
    return left;
  }

  const result = additive();
  skip();
  return result && index === input.length && Number.isFinite(result.value) ? result.value : null;
}

export function calcFormula(formula, master) {
  let expression = String(formula ?? '').trim();
  const base = Number(master) || 0;
  if (!expression) return base;
  if (/^[+\-*/]/.test(expression)) expression = 'MASTER' + expression;
  return parseExpression(expression, base) ?? 0;
}

// Plain numbers retain the old meaning: add this amount. Operator expressions
// apply to the formula subtotal, e.g. +15, -10, *1.05, /2 or +5%.
export function applyExtraCost(value, extra) {
  const base = Number(value) || 0;
  const expression = String(extra ?? '').trim();
  if (!expression) return base;
  if (/^[+\-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(expression)) return base + Number(expression);
  if (/^[+\-*/]/.test(expression) || /MASTER\s*(?:RATE)?/i.test(expression)) {
    const calculated = parseExpression(/^[+\-*/]/.test(expression) ? 'MASTER' + expression : expression, base);
    return calculated ?? base;
  }
  const amount = parseExpression(expression, 0);
  return amount === null ? base : base + amount;
}

export function roundPackingValue(value, round) {
  const step = Math.abs(Number(round));
  const numeric = Number(value) || 0;
  if (!step) return numeric;
  return Math.floor(numeric / step + 0.5 + 1e-9) * step;
}

export const roundLooseValue = roundPackingValue;
