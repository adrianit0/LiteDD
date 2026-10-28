import {
  chain,
  connect,
  editedValues,
  initialTabValues,
  initialWorkflow,
  insertNode,
  isEditableInView,
  moveNode,
  nameFromTitle,
  nameProblem,
  parseWorkflow,
  proposeName,
  pruneValues,
  reachesFinish,
  referenceWarnings,
  referencedNames,
  removeEdge,
  removeNode,
  rowProblem,
  serializeWorkflow,
  setFieldValue,
  setTabValue,
  tabOrder,
  unifyFields,
  updateNode,
  valuesToSend,
  type Workflow,
} from './model';

function build(): Workflow {
  let w = initialWorkflow();
  for (const kind of ['input', 'http', 'wait'] as const) {
    w = insertNode(w, kind, null)!.workflow;
  }
  return w;
}

describe('W-02, W-40 contenido', () => {
  it('W-02 un workflow vacío es Start unido a Finish y solo marca «Parar si error»', () => {
    const w = parseWorkflow('');
    expect(chain(w).map((n) => n.kind)).toEqual(['start', 'finish']);
    expect(w.options).toEqual({ sameInputs: false, stopOnError: true, stopOnMissing: false, lockValues: false });
  });

  it('W-80 lee y escribe el formato del servidor', () => {
    const w = build();
    expect(parseWorkflow(serializeWorkflow(w))).toEqual(w);
    expect(parseWorkflow('{"options":{"stopOnError":false},"nodes":[],"edges":[]}').options.stopOnError).toBe(false);
  });
});

describe('W-13, W-14 añadir y borrar mantienen la cadena', () => {
  it('W-14 sin selección, el nodo nuevo va justo antes de Finish y desplaza a los siguientes', () => {
    const w = build();
    expect(chain(w).map((n) => n.name ?? n.kind)).toEqual(['start', 'Input1', 'Http1', 'Espera1', 'finish']);
    const [start, input, http, wait, finish] = chain(w);
    expect(input.x).toBeGreaterThan(start.x);
    expect(http.x).toBeGreaterThan(input.x);
    expect(wait.x).toBeGreaterThan(http.x);
    expect(finish.x).toBeGreaterThan(wait.x);
    expect(http.y).toBe(start.y);
  });

  it('W-14 con un nodo seleccionado, se inserta tras él; con Finish seleccionado, antes de Finish', () => {
    const w = build();
    const input = chain(w)[1];
    const { workflow, id } = insertNode(w, 'sql', input.id)!;
    expect(chain(workflow).map((n) => n.name ?? n.kind)).toEqual(['start', 'Input1', 'Sql1', 'Http1', 'Espera1', 'finish']);
    expect(chain(workflow)[2].id).toBe(id);
    const atFinish = insertNode(w, 'input', 'finish')!.workflow;
    expect(chain(atFinish).map((n) => n.name ?? n.kind).slice(-2)).toEqual(['Input2', 'finish']);
  });

  it('W-13 borrar un nodo intermedio une a sus vecinos; Start y Finish no se borran', () => {
    const w = build();
    const http = chain(w)[2];
    const after = removeNode(w, http.id);
    expect(chain(after).map((n) => n.name ?? n.kind)).toEqual(['start', 'Input1', 'Espera1', 'finish']);
    expect(removeNode(after, 'start')).toBe(after);
    expect(removeNode(after, 'finish')).toBe(after);
  });

  it('W-16 como máximo 100 nodos', () => {
    let w = initialWorkflow();
    for (let i = 0; i < 98; i++) w = insertNode(w, 'wait', null)!.workflow;
    expect(w.nodes).toHaveLength(100);
    expect(insertNode(w, 'wait', null)).toBeNull();
  });
});

describe('W-11, W-12, W-15, W-17 flechas y cadena', () => {
  it('W-12 una flecha por salida y por entrada; la nueva sustituye a las anteriores', () => {
    const w = build();
    const [, input, http, wait] = chain(w);
    const relinked = connect(w, input.id, wait.id);
    expect(chain(relinked).map((n) => n.id)).toEqual(['start', input.id, wait.id, 'finish']);
    expect(relinked.edges.filter((e) => e.from === input.id)).toHaveLength(1);
    expect(relinked.edges.filter((e) => e.to === wait.id)).toHaveLength(1);
    // W-15: Http1 queda fuera de la cadena.
    expect(chain(relinked).some((n) => n.id === http.id)).toBe(false);
    expect(tabOrder(relinked).at(-1)!.id).toBe(http.id);
    expect(connect(w, input.id, input.id)).toBe(w);
    expect(connect(w, 'finish', input.id)).toBe(w);
    expect(connect(w, input.id, 'start')).toBe(w);
  });

  it('W-15 sin flecha hacia Finish la cadena no llega', () => {
    const w = build();
    const wait = chain(w)[3];
    expect(reachesFinish(w)).toBe(true);
    expect(reachesFinish(removeEdge(w, wait.id))).toBe(false);
  });

  it('W-11 mover ajusta a la rejilla de 16 píxeles', () => {
    const w = moveNode(initialWorkflow(), 'finish', 101, 7);
    expect(w.nodes.find((n) => n.id === 'finish')).toMatchObject({ x: 96, y: 0 });
  });
});

describe('W-21, W-22, W-28 nombres', () => {
  it('W-22 nombre a partir del título, sin acentos ni signos', () => {
    expect(nameFromTitle('Alta de usuario')).toBe('AltaDeUsuario');
    expect(nameFromTitle('Préstamos: año 2026')).toBe('PrestamosAno2026');
    expect(nameFromTitle('2026 informe')).toBe('');
    const w = build();
    expect(proposeName(w, 'http', 'Alta de usuario')).toBe('AltaDeUsuario');
    expect(proposeName(w, 'http', '¿?')).toBe('Http2');
    expect(proposeName(w, 'input')).toBe('Input2');
    expect(proposeName(w, 'http', 'input1')).toBe('Input2');
  });

  it('W-21 vacío, no válido o repetido sin distinguir mayúsculas', () => {
    const w = build();
    const [, input, http] = chain(w);
    expect(nameProblem(w, input)).toBeNull();
    expect(nameProblem(updateNode(w, http.id, { name: '' }), { ...http, name: '' })).toBe('Falta el nombre');
    expect(nameProblem(w, { ...http, name: 'año' })).toMatch(/Solo letras/);
    expect(nameProblem(w, { ...http, name: 'INPUT1' })).toBe('Ya hay otro nodo con este nombre');
  });

  it('W-28 filas del Input con nombre válido y sin repetir', () => {
    const rows = [{ name: 'id', value: '' }, { name: 'id', value: '' }, { name: '1x', value: '' }];
    expect(rowProblem(rows, 0)).toBe('Repetido');
    expect(rowProblem(rows, 2)).toBe('Nombre no válido');
  });
});

describe('W-30, W-36 referencias', () => {
  it('W-31 encuentra los nombres de las referencias; $$ es un $', () => {
    expect(referencedNames('Bearer $Login.token y $Query1[0].col1, $$no, $5')).toEqual(['Login', 'Query1']);
  });

  it('W-36 avisa de nombres que no existen o de nodos que no van antes', () => {
    const w = build();
    const [, input, http, wait] = chain(w);
    expect(referenceWarnings(w, http.id, '$Input1.id')).toEqual([]);
    expect(referenceWarnings(w, http.id, '$Nadie.x')).toEqual(['No hay ningún nodo llamado Nadie']);
    expect(referenceWarnings(w, input.id, '$Espera1')).toEqual(['Espera1 no va antes en la cadena: valdrá null']);
    expect(referenceWarnings(w, wait.id, '$Http1 $Http1')).toEqual([]);
  });
});

describe('W-41 mismos inputs, mismo valor', () => {
  function twoCalls(sameInputs: boolean) {
    let w = build();
    w = insertNode(w, 'sql', null)!.workflow;
    w = { ...w, options: { ...w.options, sameInputs } };
    const [, , http, , sql] = chain(w);
    return { w, http, sql, fields: { [http.id]: ['id', 'name'], [sql.id]: ['id'] } };
  }

  it('W-41 marcada, cambiar un campo cambia el mismo nombre en los demás nodos HTTP y SQL', () => {
    const { w, http, sql, fields } = twoCalls(true);
    const after = setFieldValue(w, fields, http.id, 'id', '54');
    expect(after.nodes.find((n) => n.id === sql.id)!.values).toEqual({ id: '54' });
    const tab = setTabValue(after, fields, {}, sql.id, 'id', '7');
    expect(tab).toEqual({ [http.id]: { id: '7' }, [sql.id]: { id: '7' } });
  });

  it('W-41 desmarcada, cada nodo tiene el suyo', () => {
    const { w, http, sql, fields } = twoCalls(false);
    const after = setFieldValue(w, fields, http.id, 'id', '54');
    expect(after.nodes.find((n) => n.id === sql.id)!.values).toEqual({});
    expect(setTabValue(after, fields, {}, sql.id, 'id', '7')).toEqual({ [sql.id]: { id: '7' } });
  });

  it('W-41 al marcarla, cada nombre toma el valor del primer nodo de la cadena', () => {
    const { w, http, sql, fields } = twoCalls(false);
    const different = updateNode(updateNode(w, http.id, { values: { id: '1' } }), sql.id, { values: { id: '2' } });
    const unified = unifyFields(different, fields);
    expect(unified.nodes.find((n) => n.id === sql.id)!.values).toEqual({ id: '1' });
    expect(unified.nodes.find((n) => n.id === http.id)!.values).toEqual({ id: '1', name: '' });
  });
});

describe('W-26 variables de la nota', () => {
  it('W-26 un nodo deja de guardar las variables que su nota ya no tiene', () => {
    let w = build();
    const http = chain(w)[2];
    w = updateNode(w, http.id, { values: { id: '1', old: 'x' } });
    expect(pruneValues(w, { [http.id]: ['id', 'nuevo'] }).nodes.find((n) => n.id === http.id)!.values).toEqual({ id: '1' });
    // Sin campos conocidos, no se toca.
    expect(pruneValues(w, {})).toBe(w);
  });
});

describe('W-44, W-51, W-52 valores de consulta', () => {
  function setup(lockValues: boolean) {
    let w = build();
    const [, input, http, wait] = chain(w);
    w = updateNode(w, input.id, { rows: [{ name: 'id', value: '1' }] });
    w = updateNode(w, http.id, { values: { id: '$Input1.id' } });
    w = updateNode(w, wait.id, { seconds: '2' });
    w = { ...w, options: { ...w.options, lockValues } };
    return { w, input, http, wait, fields: { [http.id]: ['id'] } };
  }

  it('W-51 se proponen los de la última ejecución y, donde no hay, los guardados', () => {
    const { w, input, http, wait, fields } = setup(false);
    const values = initialTabValues(w, fields, { [input.id]: { id: '7' }, [wait.id]: { seconds: '0' } });
    expect(values).toEqual({ [input.id]: { id: '7' }, [http.id]: { id: '$Input1.id' }, [wait.id]: { seconds: '0' } });
  });

  it('W-44 lo fijado vale lo guardado y no se envía', () => {
    const { w, input, http, wait, fields } = setup(true);
    const values = initialTabValues(w, fields, { [input.id]: { id: '7' }, [http.id]: { id: '9' }, [wait.id]: { seconds: '0' } });
    expect(values[http.id]).toEqual({ id: '$Input1.id' });
    expect(values[wait.id]).toEqual({ seconds: '2' });
    expect(isEditableInView(w, http)).toBe(false);
    expect(isEditableInView(w, input)).toBe(true);
    expect(Object.keys(valuesToSend(w, values))).toEqual([input.id]);
  });

  it('W-51 un valor cambiado en edición pasa a la consulta de la pestaña', () => {
    const { w, input, http, fields } = setup(false);
    const tab = { [input.id]: { id: '7' }, [http.id]: { id: 'x' } };
    const after = updateNode(w, input.id, { rows: [{ name: 'id', value: '3' }, { name: 'otro', value: 'b' }] });
    expect(editedValues(w, after, fields, tab)[input.id]).toEqual({ id: '3', otro: 'b' });
    // Lo que no cambió en edición conserva el valor de la pestaña.
    expect(editedValues(w, after, fields, tab)[http.id]).toEqual({ id: 'x' });
  });
});
