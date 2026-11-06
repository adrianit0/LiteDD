import { CurlError, curlWords, exportCurl, importCurl, shellQuote } from './curl';
import { BASIC_HEADERS, EMPTY_CONTENT, type HttpContent } from './content';

const BASES = ['http://127.0.0.1:8080/demo/', 'https://pre1.litedd-demo.test/demo/', null];
const DEFAULTS = [...BASIC_HEADERS, { key: 'Accept-Language', value: 'es-ES', enabled: true }];

const BASH = `curl 'https://pre1.litedd-demo.test/demo/user/42/renewals?page=2&sort=name%20asc' \\
  -H 'accept: application/json, text/plain, */*' \\
  -H 'accept-language: es-ES,es;q=0.9' \\
  -H 'content-type: application/json' \\
  -H 'cookie: JSESSIONID=abc; CSRF-TOKEN=tok' \\
  -H 'origin: https://pre1.litedd-demo.test' \\
  -H 'priority: u=1, i' \\
  -H 'sec-ch-ua-mobile: ?0' \\
  -H 'sec-fetch-mode: cors' \\
  -H 'user-agent: Mozilla/5.0' \\
  -H 'x-csrf-token: tok' \\
  -H 'x-requested-with: XMLHttpRequest' \\
  -H 'x-userid: usr-1' \\
  --data-raw '{"type":"renovación","note":"ampliación"}'`;

/** Lo mismo que BASH con el formato «Copy as cURL (cmd)» de Chrome. */
const CMD = [
  'curl ^"https://pre1.litedd-demo.test/demo/user/42/renewals?page=2^&sort=name^%^20asc^" ^',
  '  -H ^"content-type: application/json^" ^',
  '  -H ^"cookie: JSESSIONID=abc^" ^',
  '  -H ^"x-requested-with: XMLHttpRequest^" ^',
  '  --data-raw ^"^{^\\^"type^\\^":^\\^"renovación^\\^",^\\^"path^\\^":^\\^"C:^\\^\\temp^\\^"^}^"',
].join('\r\n');

describe('curl', () => {
  it('H-75 trocea bash: comillas simples, dobles, $\'…\' con \\u y \\x, barras y continuación', () => {
    expect(curlWords(`curl 'a b' "c \\"d\\"" e\\ f \\\n g`)).toEqual(['curl', 'a b', 'c "d"', 'e f', 'g']);
    expect(curlWords(`curl $'it\\'s\\n\\u00f3\\xc3\\xb1'`)).toEqual(['curl', "it's\nóñ"]);
  });

  it('H-75 trocea el formato cmd de Chrome con ^ y \\"', () => {
    const words = curlWords(CMD);
    expect(words[1]).toBe('https://pre1.litedd-demo.test/demo/user/42/renewals?page=2&sort=name%20asc');
    expect(words.at(-1)).toBe('{"type":"renovación","path":"C:\\temp"}');
  });

  it('H-75 H-76 H-77 H-78 «Copy as cURL (bash)» de Chrome da método, endpoint, params, cabeceras y cuerpo', () => {
    const r = importCurl(BASH, BASES, DEFAULTS);
    expect(r.title).toBe('POST /user/42/renewals');
    expect(r.content.method).toBe('POST');
    expect(r.content.endpoint).toBe('/user/42/renewals');
    expect(r.content.params).toEqual([
      { key: 'page', value: '2', enabled: true },
      { key: 'sort', value: 'name asc', enabled: true },
    ]);
    expect(r.content.headers).toEqual([
      { key: 'origin', value: 'https://pre1.litedd-demo.test', enabled: true },
      { key: 'x-requested-with', value: 'XMLHttpRequest', enabled: true },
    ]);
    expect(r.content.body).toMatchObject({ mode: 'raw', rawType: 'json', raw: '{"type":"renovación","note":"ampliación"}' });
    expect(r.content.generated).toEqual({});
    expect(r.content.login).toBe('always');
    expect(r.discarded).toEqual(
      expect.arrayContaining(['accept', 'accept-language', 'cookie', 'priority', 'sec-ch-ua-mobile', 'sec-fetch-mode', 'user-agent', 'x-csrf-token', 'x-userid']),
    );
    expect(r.warnings).toEqual([]);
  });

  it('H-75 el formato cmd da la misma nota', () => {
    const r = importCurl(CMD, BASES, DEFAULTS);
    expect(r.content.endpoint).toBe('/user/42/renewals');
    expect(r.content.headers).toEqual([{ key: 'x-requested-with', value: 'XMLHttpRequest', enabled: true }]);
    expect(r.content.body.raw).toBe('{"type":"renovación","path":"C:\\temp"}');
  });

  it('H-76 quita la URL base más larga; sin coincidencia deja la ruta y avisa', () => {
    const longer = ['http://127.0.0.1:8080/', 'http://127.0.0.1:8080/demo'];
    expect(importCurl('curl http://127.0.0.1:8080/demo/tasks', longer, []).content.endpoint).toBe('/tasks');
    const other = importCurl('curl https://otro.litedd-demo.test/api/tasks', BASES, []);
    expect(other.content.endpoint).toBe('/api/tasks');
    expect(other.warnings).toEqual(['La URL no empieza por la URL base de ningún perfil: se usa solo la ruta.']);
    expect(importCurl('curl http://127.0.0.1:8080/demo', BASES, []).content.endpoint).toBe('/');
  });

  it('H-77 descarta Authorization, -u, -b y las cabeceras del cliente HTTP', () => {
    const r = importCurl(
      `curl -u demo:secreto -b 'a=1' -H 'Authorization: Basic eA==' -H 'Host: x' -H 'Accept-Encoding: gzip' -H 'If-Match: 3' http://127.0.0.1:8080/demo/x`,
      BASES,
      [],
    );
    expect(r.content.headers).toEqual([{ key: 'If-Match', value: '3', enabled: true }]);
    expect(r.discarded).toEqual(['usuario y contraseña (-u)', 'Cookie','Authorization', 'Host', 'Accept-Encoding']);
    expect(JSON.stringify(r.content)).not.toContain('secreto');
  });

  it('H-78 un Content-Type que LiteDD no genera queda como valor cambiado; sin Content-Type es el de curl', () => {
    const form = importCurl(`curl http://127.0.0.1:8080/demo/x -d 'a=1' -d 'b=dos'`, BASES, []);
    expect(form.content.method).toBe('POST');
    expect(form.content.body).toMatchObject({ mode: 'raw', rawType: 'text', raw: 'a=1&b=dos' });
    expect(form.content.generated).toEqual({ 'Content-Type': { value: 'application/x-www-form-urlencoded', enabled: true } });
    const xml = importCurl(`curl -XPUT http://127.0.0.1:8080/demo/x -H 'Content-Type: application/xml' --data-binary '<a/>'`, BASES, []);
    expect(xml.content.method).toBe('PUT');
    expect(xml.content.body).toMatchObject({ mode: 'raw', rawType: 'xml' });
    expect(xml.content.generated).toEqual({});
  });

  it('H-78 -F y un cuerpo multipart dan form-data; los ficheros se descartan', () => {
    const f = importCurl(`curl http://127.0.0.1:8080/demo/up -F 'name=Ana' -F 'doc=@informe.pdf' --form-string 'at=@x'`, BASES, []);
    expect(f.content.body.mode).toBe('form-data');
    expect(f.content.body.form.map((r) => [r.key, r.value])).toEqual([
      ['name', 'Ana'],
      ['at', '@x'],
    ]);
    expect(f.warnings).toEqual(['Se descarta el fichero del campo doc.']);

    const body = `------B\r\nContent-Disposition: form-data; name="title"\r\n\r\nRenovación\r\n------B\r\nContent-Disposition: form-data; name="file"; filename="a.txt"\r\nContent-Type: text/plain\r\n\r\nhola\r\n------B--\r\n`;
    const m = importCurl(`curl http://127.0.0.1:8080/demo/up -H 'content-type: multipart/form-data; boundary=----B' --data-raw ${shellQuote(body)}`, BASES, []);
    expect(m.content.body.mode).toBe('form-data');
    expect(m.content.body.form).toEqual([{ key: 'title', value: 'Renovación', enabled: true }]);
    expect(m.warnings).toEqual(['Se descarta el fichero del campo file.']);
  });

  it('H-78 -G lleva los datos a params; -I es HEAD; -X manda', () => {
    const g = importCurl(`curl -G http://127.0.0.1:8080/demo/x --data-urlencode 'q=a b' -d page=1`, BASES, []);
    expect(g.content.method).toBe('GET');
    expect(g.content.params).toEqual([
      { key: 'q', value: 'a b', enabled: true },
      { key: 'page', value: '1', enabled: true },
    ]);
    expect(g.content.body.mode).toBe('none');
    expect(importCurl('curl -I http://127.0.0.1:8080/demo/x', BASES, []).content.method).toBe('HEAD');
    expect(importCurl('curl --request delete --compressed -s http://127.0.0.1:8080/demo/x', BASES, []).content.method).toBe('DELETE');
  });

  it('H-75 un texto que no es cURL o sin URL no crea nada y dice por qué', () => {
    expect(() => importCurl('wget http://x', BASES, [])).toThrow(CurlError);
    expect(() => importCurl('wget http://x', BASES, [])).toThrow('debe empezar por curl');
    expect(() => importCurl('curl -H "a: b"', BASES, [])).toThrow('no tiene URL');
    expect(() => importCurl("curl 'http://x", BASES, [])).toThrow('comilla simple');
    expect(() => importCurl('curl -X TRACE http://127.0.0.1/', BASES, [])).toThrow('TRACE');
  });

  const note = (over: Partial<HttpContent>): HttpContent => ({ ...structuredClone(EMPTY_CONTENT), ...over });

  it('H-79 «Copiar como cURL» lleva URL base, params, cabeceras y cuerpo con las variables puestas', () => {
    const c = note({
      method: 'POST',
      endpoint: '/user/#{id}/renewals',
      pathValues: { id: '4 2', kind: "renovación d'ampliación" },
      params: [
        { key: 'page', value: '#{id}', enabled: true },
        { key: 'off', value: '1', enabled: false },
      ],
      headers: [{ key: 'X-Requested-With', value: 'XMLHttpRequest', enabled: true }],
      generated: { 'Cache-Control': { value: null, enabled: false } },
      body: { mode: 'raw', rawType: 'json', raw: '{"type":"#{kind}"}', form: [] },
    });
    const r = exportCurl(c, 'http://127.0.0.1:8080/demo/', '0.1.0', DEFAULTS);
    expect(r.missing).toEqual([]);
    expect(r.command).toBe(
      [
        "curl 'http://127.0.0.1:8080/demo/user/4%202/renewals?page=4%202'",
        '-X POST',
        "-H 'Accept: application/json'",
        "-H 'User-Agent: LiteDD/0.1.0'",
        "-H 'Accept-Language: es-ES'",
        "-H 'Content-Type: application/json; charset=UTF-8'",
        "-H 'X-Requested-With: XMLHttpRequest'",
        `--data-raw '{"type":"renovación d'\\''ampliación"}'`,
      ].join(' \\\n  '),
    );
    // Lo copiado se vuelve a leer igual.
    const back = importCurl(r.command, BASES, DEFAULTS);
    expect(back.content.endpoint).toBe('/user/4%202/renewals');
    expect(back.content.body.raw).toBe(`{"type":"renovación d'ampliación"}`);
  });

  it('H-79 nunca lleva contraseñas, cookies ni cabeceras del login', () => {
    const c = note({
      endpoint: '/x',
      headers: [
        { key: 'Cookie', value: 'JSESSIONID=abc', enabled: true },
        { key: 'Authorization', value: 'Basic eA==', enabled: true },
        { key: 'X-CSRF-TOKEN', value: 'tok', enabled: true },
        { key: 'x-userid', value: 'usr-1', enabled: true },
      ],
    });
    const defaults = [...DEFAULTS, { key: 'Cookie', value: 'lang=es', enabled: true }];
    const { command } = exportCurl(c, 'http://127.0.0.1:8080/demo', '0.1.0', defaults);
    expect(command).not.toMatch(/cookie|authorization|csrf|userid|JSESSIONID|lang=es/i);
  });

  it('H-79 una variable sin valor queda como #{nombre} y se indica; form-data va con --form-string sin Content-Type; HEAD es -I', () => {
    const c = note({
      method: 'PUT',
      endpoint: '/up/#{id}',
      body: { mode: 'form-data', rawType: 'json', raw: '', form: [{ key: 'doc', value: '@no-es-fichero', enabled: true }] },
    });
    const r = exportCurl(c, 'http://127.0.0.1:8080/demo/', '0.1.0', []);
    expect(r.missing).toEqual(['id']);
    expect(r.command).toContain("curl 'http://127.0.0.1:8080/demo/up/#{id}'");
    expect(r.command).toContain("--form-string 'doc=@no-es-fichero'");
    expect(r.command).not.toContain('Content-Type');
    expect(exportCurl(note({ method: 'HEAD', endpoint: '/x' }), 'http://h/', '1', []).command).toBe("curl 'http://h/x' \\\n  -I \\\n  -H 'Content-Type: application/json'");
  });
});
