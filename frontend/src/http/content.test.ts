import {
  EMPTY_CONTENT,
  formatJson,
  generatedHeaders,
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

  it('H-15 cabeceras generadas según el cuerpo y el login', () => {
    const none = { accept: null, userAgent: null, cacheControl: null };
    const plain = generatedHeaders(EMPTY_CONTENT, '0.1.0', false, none);
    expect(plain.map((h) => [h.name, h.defaultValue])).toEqual([
      ['Accept', 'application/json'],
      ['Content-Type', 'application/json'],
      ['User-Agent', 'LiteDD/0.1.0'],
      ['Cache-Control', 'no-cache'],
    ]);
    const xml = { ...EMPTY_CONTENT, body: { ...EMPTY_CONTENT.body, mode: 'raw' as const, rawType: 'xml' as const } };
    const withLogin = generatedHeaders(xml, '0.1.0', true, none);
    expect(withLogin.find((h) => h.name === 'Content-Type')?.defaultValue).toBe('application/xml');
    expect(withLogin.filter((h) => h.fromLogin).map((h) => h.name)).toEqual(['X-USERID', 'X-CSRF-TOKEN', 'Cookie']);
    // ADR-0022: los valores de «Ajustes» sustituyen a los de serie.
    const custom = generatedHeaders(EMPTY_CONTENT, '0.1.0', false, { accept: '*/*', userAgent: 'MiCliente/2.0', cacheControl: null });
    expect(custom.map((h) => h.defaultValue)).toEqual(['*/*', 'application/json', 'MiCliente/2.0', 'no-cache']);
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
