import fs from 'fs';
import path from 'path';
import test from 'ava';
import m from '.';

const cwd = process.cwd();
const fixture = [
	'a.tmp',
	'b.tmp',
	'c.tmp',
	'd.tmp',
	'e.tmp'
];

test.before(() => {
	if (!fs.existsSync('tmp')) {
		fs.mkdirSync('tmp');
	}
	fixture.forEach(fs.writeFileSync.bind(fs));
	fixture.forEach(x => fs.writeFileSync(path.join(__dirname, 'tmp', x)));
	fs.writeFileSync('fixtures/gitignore/foo.js', fs.readFileSync('fixtures/negative/foo.js', 'utf-8'));
});

test.after(() => {
	fixture.forEach(fs.unlinkSync.bind(fs));
	fixture.forEach(x => fs.unlinkSync(path.join(__dirname, 'tmp', x)));
	fs.rmdirSync('tmp');
	fs.unlinkSync('fixtures/gitignore/foo.js');
});

test('glob - async', async t => {
	t.deepEqual(await m('*.tmp'), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
});

test('glob - async - multiple file paths', t => {
	t.deepEqual(m.sync(['a.tmp', 'b.tmp']), ['a.tmp', 'b.tmp']);
});

test('glob with multiple patterns - async', async t => {
	t.deepEqual(await m(['a.tmp', '*.tmp', '!{c,d,e}.tmp']), ['a.tmp', 'b.tmp']);
});

test('respect patterns order', async t => {
	t.deepEqual(await m(['!*.tmp', 'a.tmp']), ['a.tmp']);
});

test('respect patterns order - sync', t => {
	t.deepEqual(m.sync(['!*.tmp', 'a.tmp']), ['a.tmp']);
});

test('glob - sync', t => {
	t.deepEqual(m.sync('*.tmp'), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	t.deepEqual(m.sync(['a.tmp', '*.tmp', '!{c,d,e}.tmp']), ['a.tmp', 'b.tmp']);
	t.deepEqual(m.sync(['!*.tmp', 'a.tmp']), ['a.tmp']);
});

test('glob - sync - multiple file paths', t => {
	t.deepEqual(m.sync(['a.tmp', 'b.tmp']), ['a.tmp', 'b.tmp']);
});

test('return [] for all negative patterns - sync', t => {
	t.deepEqual(m.sync(['!a.tmp', '!b.tmp']), []);
});

test('return [] for all negative patterns - async', async t => {
	t.deepEqual(await m(['!a.tmp', '!b.tmp']), []);
});

test('cwd option', t => {
	process.chdir('tmp');
	t.deepEqual(m.sync('*.tmp', {cwd}), ['a.tmp', 'b.tmp', 'c.tmp', 'd.tmp', 'e.tmp']);
	t.deepEqual(m.sync(['a.tmp', '*.tmp', '!{c,d,e}.tmp'], {cwd}), ['a.tmp', 'b.tmp']);
	process.chdir(cwd);
});

test(`don't mutate the options object - async`, async t => {
	await m(['*.tmp', '!b.tmp'], Object.freeze({ignore: Object.freeze([])}));
	t.pass();
});

test(`don't mutate the options object - sync`, t => {
	m.sync(['*.tmp', '!b.tmp'], Object.freeze({ignore: Object.freeze([])}));
	t.pass();
});

test('expose generateGlobTasks', t => {
	const tasks = m.generateGlobTasks(['*.tmp', '!b.tmp'], {ignore: ['c.tmp']});

	t.is(tasks.length, 1);
	t.is(tasks[0].pattern, '*.tmp');
	t.deepEqual(tasks[0].opts.ignore, ['c.tmp', 'b.tmp']);
});

test('expose hasMagic', t => {
	t.true(m.hasMagic('**'));
	t.true(m.hasMagic(['**', 'path1', 'path2']));
	t.false(m.hasMagic(['path1', 'path2']));
});

test('expandDirectories option', t => {
	t.deepEqual(m.sync('tmp'), ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
	t.deepEqual(m.sync('tmp', {expandDirectories: ['a*', 'b*']}), ['tmp/a.tmp', 'tmp/b.tmp']);
	t.deepEqual(m.sync('tmp', {
		expandDirectories: {
			files: ['a', 'b'],
			extensions: ['tmp']
		}
	}), ['tmp/a.tmp', 'tmp/b.tmp']);
	t.deepEqual(m.sync('tmp', {
		expandDirectories: {
			files: ['a', 'b'],
			extensions: ['tmp']
		},
		ignore: ['**/b.tmp']
	}), ['tmp/a.tmp']);
});

test('expandDirectories:true and onlyFiles:true option', t => {
	t.deepEqual(m.sync('tmp', {onlyFiles: true}), ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
});

test.failing('expandDirectories:true and onlyFiles:false option', t => {
	// Node-glob('tmp/**') => ['tmp', 'tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']
	// Fast-glob('tmp/**') => ['tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']
	// See https://github.com/mrmlnc/fast-glob/issues/47
	t.deepEqual(m.sync('tmp', {onlyFiles: false}), ['tmp', 'tmp/a.tmp', 'tmp/b.tmp', 'tmp/c.tmp', 'tmp/d.tmp', 'tmp/e.tmp']);
});

// Rejected for being an invalid pattern
[
	{},
	[{}],
	true,
	[true],
	false,
	[false],
	null,
	[null],
	undefined,
	[undefined],
	NaN,
	[NaN],
	5,
	[5],
	function () {},
	[function () {}]
].forEach(v => {
	const valstring = v === undefined ?
		'undefined' :
		(JSON.stringify(v) || v.toString());
	const msg = 'Patterns must be a string or an array of strings';

	test(`rejects the promise for invalid patterns input: ${valstring} - async`, async t => {
		await t.throws(m(v), TypeError);
		await t.throws(m(v), msg);
	});

	test(`throws for invalid patterns input: ${valstring}`, t => {
		t.throws(() => m.sync(v), TypeError);
		t.throws(() => m.sync(v), msg);
	});
	test(`generateGlobTasks throws for invalid patterns input: ${valstring}`, async t => {
		await t.throws(m(v), TypeError);
		await t.throws(m(v), msg);
	});
});

test('gitignore option defaults to false', async t => {
	const actual = await m('*', {onlyFiles: false});
	t.true(actual.indexOf('node_modules') > -1);
});

test('gitignore option defaults to false - sync', t => {
	const actual = m.sync('*', {onlyFiles: false});
	t.true(actual.indexOf('node_modules') > -1);
});

test('respects gitignore option true', async t => {
	const actual = await m('*', {gitignore: true, onlyFiles: false});
	t.false(actual.indexOf('node_modules') > -1);
});

test('respects gitignore option true - sync', t => {
	const actual = m.sync('*', {gitignore: true, onlyFiles: false});
	t.false(actual.indexOf('node_modules') > -1);
});

test('respects gitignore option false', async t => {
	const actual = await m('*', {gitignore: false, onlyFiles: false});
	t.true(actual.indexOf('node_modules') > -1);
});

test('respects gitignore option false - sync', t => {
	const actual = m.sync('*', {gitignore: false, onlyFiles: false});
	t.true(actual.indexOf('node_modules') > -1);
});

test('gitignore', async t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore');
	const actual = await m('*', {cwd, gitignore: true});
	const expected = ['bar.js'];
	t.deepEqual(actual, expected);
});

test('gitignore - sync', t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore');
	const actual = m.sync('*', {cwd, gitignore: true});
	const expected = ['bar.js'];
	t.deepEqual(actual, expected);
});

test('ignore ignored .gitignore', async t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore');
	const actual = await m('*', {ignore: ['**/.gitignore'], cwd, gitignore: true});
	const expected = ['bar.js', 'foo.js'];
	t.deepEqual(actual, expected);
});

test('ignore ignored .gitignore - sync', t => {
	const cwd = path.join(__dirname, 'fixtures/gitignore');
	const actual = m.sync('*', {ignore: ['**/.gitignore'], cwd, gitignore: true});
	const expected = ['bar.js', 'foo.js'];
	t.deepEqual(actual, expected);
});

test('negative gitignore', async t => {
	const cwd = path.join(__dirname, 'fixtures/negative');
	const actual = await m('*', {cwd, gitignore: true});
	const expected = ['foo.js'];
	t.deepEqual(actual, expected);
});

test('negative ignore', async t => {
	const cwd = path.join(__dirname, 'fixtures/negative');
	const actual = await m('*', {ignore: ['**/*.js', '!**/foo.js'], gitignore: false, cwd});
	const expected = ['foo.js'];
	t.deepEqual(actual, expected);
});

test('negative ignore - sync', t => {
	const cwd = path.join(__dirname, 'fixtures/negative');
	const actual = m.sync('*', {ignore: ['**/*.js', '!**/foo.js'], gitignore: false, cwd});
	const expected = ['foo.js'];
	t.deepEqual(actual, expected);
});

test('negative gitignore - sync', t => {
	const cwd = path.join(__dirname, 'fixtures/negative');
	const actual = m.sync('*', {cwd, gitignore: true});
	const expected = ['foo.js'];
	t.deepEqual(actual, expected);
});

test('multiple negation', async t => {
	const cwd = path.join(__dirname, 'fixtures/multiple-negation');
	const actual = await m('*', {cwd, gitignore: true});
	const expected = ['!unicorn.js', '!!unicorn.js'];
	t.deepEqual(actual, expected);
});

test('multiple negation - sync', t => {
	const cwd = path.join(__dirname, 'fixtures/multiple-negation');
	const actual = m.sync('*', {cwd, gitignore: true});
	const expected = ['!unicorn.js', '!!unicorn.js'];
	t.deepEqual(actual, expected);
});
