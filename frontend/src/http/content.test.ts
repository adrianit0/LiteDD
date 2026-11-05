import {
  BASIC_HEADERS,
  EMPTY_CONTENT,
  contentTypeFor,
  defaultHeaderProblem,
  formatJson,
  generatedHeaders,
  restoreBasicHeaders,
  serieValue,
  joinUrl,
  parseContent,
  oldVariable,
  variableNames,
  prettyBody,
  serializeContent,
  sizeText,
} from './content';

describe('contenido de una nota HTTP', () => {
  it('H-03 una nota nueva o ilegible es un GET vacío; lo guardado se recupera igual', () => {
    expect(parseContent('')).toEqual(EMPTY_CONTENT);
    expect(parseContent('{no es json')).toEqual(EMPTY_CONTENT);
    const content = {
      ...EMPTY_CONTENT,
      method: 'POST' as const,
      endpoint: '/user/{id}',
      pathValues: { id: '5' },
      params: [{ key: 'page', value: '2', enabled: false }],
      login: 'reuse' as const,
      user: 'demo',
      body: { mode: 'raw' as const, rawType: 'xml' as const, raw: '<a/>', form: [] },
    };
    expect(parseContent(serializeContent(content))).toEqual(content);
  });

  it('H-03 H-13 valores desconocidos toman el valor por defecto', () => {
    const c = parseContent('{"method":"TRACE","login":"x","body":{"mode":"ftp"},"params":[{"key":"a"}]}');
    expect(c.method).toBe('GET');
    expect(c.login).toBe('always');
    expect(c.body.mode).toBe('none');
    expect(c.params).toEqual([{ key: 'a', value: '', enabled: true }]);
  });

  it('H-11 una sola barra entre base y endpoint', () => {
    expect(joinUrl('http://127.0.0.1:8080/demo/', '/user')).toBe('http://127.0.0.1:8080/demo/user');
    expect(joinUrl('http://127.0.0.1:8080/demo', 'user')).toBe('http://127.0.0.1:8080/demo/user');
    expect(joinUrl('http://127.0.0.1:8080/demo/', 'user')).toBe('http://127.0.0.1:8080/demo/user');
    expect(joinUrl('http://127.0.0.1:8080/demo', '/user')).toBe('http://127.0.0.1:8080/demo/user');
  });

  it('H-12 variables #{…} de toda la nota, en orden y sin repetir; solo de lo que se envía', () => {
    const c = parseContent(
      JSON.stringify({
        endpoint: '/user/#{id}/tasks/#{ taskId }/#{id}',
        params: [
          { key: '#{campo}', value: '#{id}' },
          { key: 'off', value: '#{apagada}', enabled: false },
        ],
        headers: [{ key: 'X-Trace', value: '#{traza}' }],
        generated: { Accept: { value: '#{tipo}', enabled: true }, 'User-Agent': { value: '#{nada}', enabled: false } },
        body: { mode: 'raw', raw: '{"nombre": "#{nombre}"}', form: [{ key: 'f', value: '#{noEnviada}' }] },
      }),
    );
    expect(variableNames(c)).toEqual(['id', 'taskId', 'campo', 'traza', 'tipo', 'nombre']);
    expect(variableNames(EMPTY_CONTENT)).toEqual([]);
    const form = { ...c, body: { ...c.body, mode: 'form-data' as const } };
    expect(variableNames(form)).toContain('noEnviada');
    expect(variableNames(form)).not.toContain('nombre');
  });

  it('H-18 la forma antigua {nombre} se detecta', () => {
    expect(oldVariable('/user/{id}/tasks')).toBe('id');
    expect(oldVariable('/user/#{id}/tasks')).toBeNull();
  });

  it('H-15 H-72 cabeceras generadas: las de «Ajustes», Content-Type y las del login', () => {
    const plain = generatedHeaders(EMPTY_CONTENT, '0.1.0', false, BASIC_HEADERS);
    expect(plain.map((h) => [h.name, h.defaultValue, h.enabled])).toEqual([
      ['Accept', 'application/json', true],
      ['User-Agent', 'LiteDD/0.1.0', true],
      ['Cache-Control', 'no-cache', true],
      ['Content-Type', 'application/json', true],
    ]);
    const xml = { ...EMPTY_CONTENT, body: { ...EMPTY_CONTENT.body, mode: 'raw' as const, rawType: 'xml' as const } };
    const withLogin = generatedHeaders(xml, '0.1.0', true, BASIC_HEADERS);
    expect(withLogin.find((h) => h.name === 'Content-Type')?.defaultValue).toBe('application/xml; charset=UTF-8');
    expect(withLogin.filter((h) => h.fromLogin).map((h) => [h.name, h.defaultValue])).toEqual([
      ['X-USERID', null],
      ['X-CSRF-TOKEN', null],
      ['Cookie', null],
    ]);
    // Los valores de «Ajustes» sustituyen a los de serie; una desactivada llega desactivada.
    const custom = generatedHeaders(EMPTY_CONTENT, '0.1.0', false, [
      { key: 'Accept', value: '*/*', enabled: true },
      { key: 'X-Requested-With', value: 'XMLHttpRequest', enabled: false },
      { key: ' ', value: 'sin nombre', enabled: true },
    ]);
    expect(custom.map((h) => [h.name, h.defaultValue, h.enabled])).toEqual([
      ['Accept', '*/*', true],
      ['X-Requested-With', 'XMLHttpRequest', false],
      ['Content-Type', 'application/json', true],
    ]);
  });

  it('H-73 una Cookie de «Ajustes» activa se añade a la del login en su sitio', () => {
    const rows = [
      { key: 'Cookie', value: 'LANG-ATDESK=ES', enabled: true },
      { key: 'Accept', value: '', enabled: true },
    ];
    const withLogin = generatedHeaders(EMPTY_CONTENT, '0.1.0', true, rows);
    expect(withLogin.map((h) => [h.name, h.defaultValue, h.fromLogin])).toEqual([
      ['Cookie', 'LANG-ATDESK=ES', true],
      ['Accept', 'application/json', false],
      ['Content-Type', 'application/json', false],
      ['X-USERID', null, true],
      ['X-CSRF-TOKEN', null, true],
    ]);
    // Sin login se envía sola; desactivada, con login solo van las del login.
    expect(generatedHeaders(EMPTY_CONTENT, '0.1.0', false, rows)[0]).toEqual({ name: 'Cookie', defaultValue: 'LANG-ATDESK=ES', fromLogin: false, enabled: true });
    const off = generatedHeaders(EMPTY_CONTENT, '0.1.0', true, [{ ...rows[0], enabled: false }]);
    expect(off[0]).toEqual({ name: 'Cookie', defaultValue: null, fromLogin: true, enabled: true });
  });

  it('H-73 nombres que no valen como cabecera por defecto', () => {
    const rows = [
      { key: 'Accept', value: '', enabled: true },
      { key: 'accept', value: 'x', enabled: true },
      { key: 'Host', value: '', enabled: true },
      { key: 'Content-Type', value: '', enabled: true },
      { key: 'Authorization', value: '', enabled: true },
      { key: 'Mi Cabecera', value: '', enabled: true },
      { key: 'Accept-Language', value: 'es-ES', enabled: true },
      { key: 'Cookie', value: 'LANG-ATDESK=ES', enabled: true },
    ];
    expect(rows.map((r) => defaultHeaderProblem(r, rows))).toEqual([
      'Está repetida',
      'Está repetida',
      'La pone el cliente; no se puede escribir',
      'La calcula LiteDD en cada llamada',
      'La calcula LiteDD en cada llamada',
      'No es un nombre de cabecera válido',
      null,
      null,
    ]);
  });

  it('H-74 «Restablecer básicas» las pone al principio y conserva las demás', () => {
    const rows = [
      { key: 'Accept-Language', value: 'es-ES', enabled: true },
      { key: 'user-agent', value: 'Roto', enabled: false },
      { key: 'X-Requested-With', value: 'XMLHttpRequest', enabled: false },
    ];
    expect(restoreBasicHeaders(rows)).toEqual([...BASIC_HEADERS, rows[0], rows[2]]);
    expect(restoreBasicHeaders([])).toEqual(BASIC_HEADERS);
    expect(serieValue('User-Agent', '1.2.3')).toBe('LiteDD/1.2.3');
    expect(serieValue('Accept-Language', '1.2.3')).toBeNull();
  });

  it('H-17 el Content-Type de un cuerpo raw declara UTF-8 (ADR-0038)', () => {
    const raw = (rawType: 'json' | 'text' | 'xml') => ({ ...EMPTY_CONTENT.body, mode: 'raw' as const, rawType });
    expect(contentTypeFor(raw('json'))).toBe('application/json; charset=UTF-8');
    expect(contentTypeFor(raw('text'))).toBe('text/plain; charset=UTF-8');
    expect(contentTypeFor(raw('xml'))).toBe('application/xml; charset=UTF-8');
    expect(contentTypeFor({ ...EMPTY_CONTENT.body, mode: 'form-data' })).toBe('multipart/form-data');
    expect(contentTypeFor(EMPTY_CONTENT.body)).toBe('application/json');
  });

  it('H-17 H-34 formatear JSON y mostrar cuerpos', () => {
    expect(formatJson('{"a":1,"b":[2]}')).toBe('{\n  "a": 1,\n  "b": [\n    2\n  ]\n}');
    expect(formatJson('{a:1}')).toBeNull();
    expect(prettyBody('{"ok":true}', 'application/json')).toEqual({ text: '{\n  "ok": true\n}', json: true });
    expect(prettyBody('[1]', null)).toEqual({ text: '[\n  1\n]', json: true });
    expect(prettyBody('hola', 'text/plain')).toEqual({ text: 'hola', json: false });
    expect(prettyBody('{roto', 'application/json')).toEqual({ text: '{roto', json: false });
  });

  it('H-33 U-03 tamaños con coma decimal', () => {
    expect(sizeText(512)).toBe('512 B');
    expect(sizeText(1536)).toBe('1,5 KB');
    expect(sizeText(3 * 1024 * 1024)).toBe('3 MB');
  });
});
