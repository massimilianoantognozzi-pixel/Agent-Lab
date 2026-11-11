"""Verify reviewed synthetic model proposals; not a general Python sandbox."""
import ast
import hashlib
import json
import math
from pathlib import Path
import sys

report_path = Path(sys.argv[1]).resolve(strict=True)
allowed_artifacts = Path(__file__).resolve().parents[1] / 'artifacts' / 'local-devstral'
if not report_path.is_relative_to(allowed_artifacts.resolve()) or report_path.parent == allowed_artifacts.resolve():
    raise SystemExit('Report path outside authorized lab artifact runs.')
report = json.loads(report_path.read_text(encoding='utf-8'))
artifact_dir = report_path.parent
if report.get('mode') not in ('code', 'fix') or not report.get('pass') or not report.get('proposalStagePass'):
    raise SystemExit('The matching proposal stage must pass before functional tests.')
proposals = report.get('proposals', [])
expected_names = {'code-v1', 'code-v2'} if report['mode'] == 'code' else {entry['name'] for entry in proposals if entry['name'] in {'code-v3', 'code-v4', 'code-v5'}}
if {entry['name'] for entry in proposals} != expected_names or len(proposals) != (2 if report['mode'] == 'code' else 1):
    raise SystemExit('Expected two proposals in this exact run.')

checks = []
safe_builtins = {'ValueError': ValueError, 'round': round, 'sum': sum, 'len': len, 'float': float,
                 'int': int, 'min': min, 'max': max, 'abs': abs}


def validate_source(source):
    tree = ast.parse(source)
    functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)]
    if len(functions) != 1 or functions[0].name != 'calculate_quote' or functions[0].decorator_list:
        raise ValueError('Expected only the single synthetic calculation function.')
    for node in tree.body:
        if not isinstance(node, ast.FunctionDef) and not (isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str)):
            raise ValueError('Unexpected top-level statement.')
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom, ast.ClassDef, ast.AsyncFunctionDef, ast.While, ast.Lambda, ast.Global, ast.Nonlocal)):
            raise ValueError('Unexpected capability in synthetic calculation.')
        if isinstance(node, ast.Name) and node.id.startswith('__'):
            raise ValueError('Reflection is excluded from this proof.')
        if isinstance(node, ast.Attribute) and node.attr != 'get':
            raise ValueError('Only plain dictionary get is permitted here.')
        if isinstance(node, ast.Call):
            allowed = isinstance(node.func, ast.Name) and node.func.id in safe_builtins
            allowed = allowed or isinstance(node.func, ast.Attribute) and node.func.attr == 'get'
            if not allowed:
                raise ValueError('Unexpected function call in the proposed code.')
    return tree


def expect_value(function, name, args, kwargs, expected):
    result = function(*args, **kwargs)
    if not isinstance(result, dict) or set(result) != set(expected):
        raise AssertionError(f'{name}: wrong result fields')
    if any(type(result[key]) not in (int, float) or not math.isfinite(result[key]) for key in expected):
        raise AssertionError(f'{name}: result must contain finite numbers')
    if any(abs(result[key] - value) > 1e-9 for key, value in expected.items()):
        raise AssertionError(f'{name}: wrong calculation {result!r}')
    checks.append({'name': name, 'pass': True})


def expect_rejection(function, name, args, kwargs):
    try:
        function(*args, **kwargs)
    except ValueError:
        checks.append({'name': name, 'pass': True})
        return
    raise AssertionError(f'{name}: expected ValueError')


items = [{'quantity': 2, 'unit_price': 100}, {'quantity': 1, 'unit_price': 50}]
try:
    for entry in sorted(proposals, key=lambda item: item['name']):
        file = Path(entry['file']).resolve(strict=True)
        if file.parent != artifact_dir or file.name != entry['name'] + '.py':
            raise ValueError('Proposal path does not belong to this report.')
        raw = file.read_bytes()
        if hashlib.sha256(raw).hexdigest() != entry['sha256']:
            raise ValueError('Proposal changed after model generation.')
        tree = validate_source(raw.decode('utf-8'))
        namespace = {'__builtins__': safe_builtins}
        exec(compile(tree, str(file), 'exec'), namespace)
        function = namespace['calculate_quote']
        prefix = entry['name']
        expect_value(function, prefix + '-base', (items,), {}, {'subtotal': 250, 'vat': 55, 'total': 305})
        expect_value(function, prefix + '-empty', ([],), {}, {'subtotal': 0, 'vat': 0, 'total': 0})
        expect_value(function, prefix + '-zero-vat', (items,), {'vat_rate': 0}, {'subtotal': 250, 'vat': 0, 'total': 250})
        expect_value(function, prefix + '-rounding', ([{'quantity': 3, 'unit_price': 3.99}],), {}, {'subtotal': 11.97, 'vat': 2.63, 'total': 14.60})
        expect_rejection(function, prefix + '-negative-quantity', ([{'quantity': -1, 'unit_price': 5}],), {})
        expect_rejection(function, prefix + '-negative-price', ([{'quantity': 1, 'unit_price': -5}],), {})
        expect_rejection(function, prefix + '-negative-vat', (items,), {'vat_rate': -0.1})
        if prefix != 'code-v1':
            expect_value(function, prefix + '-discount', (items,), {'discount_rate': 0.1}, {'subtotal': 225, 'vat': 49.5, 'total': 274.5})
            expect_value(function, prefix + '-full-discount', (items,), {'discount_rate': 1}, {'subtotal': 0, 'vat': 0, 'total': 0})
            expect_rejection(function, prefix + '-negative-discount', (items,), {'discount_rate': -0.1})
            expect_rejection(function, prefix + '-excess-discount', (items,), {'discount_rate': 1.1})
    result = {'pass': True, 'runId': report['runId'], 'checks': checks, 'proposals': proposals}
except Exception as error:
    result = {'pass': False, 'runId': report['runId'], 'checks': checks, 'error': str(error)}
    raise
finally:
    (artifact_dir / 'functional-tests.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps({'pass': True, 'checks': len(checks), 'runId': report['runId']}))
