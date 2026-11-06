import {
  addNoteNode,
  assignmentProblem,
  conditionProblem,
  connect,
  flow,
  isSingleReference,
  openOutputs,
  setEdgePoints,
  wouldCycle,
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
  referenceWarnings,
  referencedNames,
  removeEdge,
  removeNode,
  savedValues,
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

/** Start → Input1 → Http1 → Espera1 → Finish, añadiendo cada nodo tras el anterior seleccionado. */
function build(): Workflow {
  let w = initialWorkflow();
  let selected = 'start';
  for (const kind of ['input', 'http', 'wait'] as const) {
    const result = insertNode(w, kind, selected)!;
    w = result.workflow;
    selected = result.id;
  }
  return w;
}

describe('W-02, W-40 contenido', () => {
  it('W-02 un workflow vacío es Start unido a Finish y solo marca «Parar si error»', () => {
    const w = parseWorkflow('');
    expect(flow(w).map((n) => n.kind)).toEqual(['start', 'finish']);
    expect(w.options).toEqual({ sameInputs: false, stopOnError: true, stopOnMissing: false, lockValues: false });
  });

  it('W-80 lee y escribe el formato del servidor', () => {
    const w = build();
    expect(parseWorkflow(serializeWorkflow(w))).toEqual(w);
    expect(parseWorkflow('{"options":{"stopOnError":false},"nodes":[],"edges":[]}').options.stopOnError).toBe(false);
  });
});

describe('W-13, W-14 añadir y borrar mantienen el flujo', () => {
  it('W-14 sin selección, el nodo nuevo queda suelto, sin flechas y debajo de los demás', () => {
    const w = build();
    const { workflow, id } = insertNode(w, 'login', null)!;
    const node = workflow.nodes.find((n) => n.id === id)!;
    expect(node).toMatchObject({ kind: 'login', name: 'Login1', values: { user: '' } });
    expect(workflow.edges).toEqual(w.edges);
    expect(flow(workflow).some((n) => n.id === id)).toBe(false);
    expect(node.y).toBeGreaterThan(Math.max(...w.nodes.map((n) => n.y)));
  });

  it('W-14 al insertar tras el seleccionado, los siguientes se desplazan lo justo', () => {
    const w = build();
    expect(flow(w).map((n) => n.name ?? n.kind)).toEqual(['start', 'Input1', 'Http1', 'Espera1', 'finish']);
    const [start, input, http, wait, finish] = flow(w);
    expect(input.x).toBeGreaterThan(start.x);
    expect(http.x).toBeGreaterThan(input.x);
    expect(wait.x).toBeGreaterThan(http.x);
    expect(finish.x).toBeGreaterThan(wait.x);
    expect(http.y).toBe(start.y);
    // Solo lo justo: el hueco hasta Finish es el mismo que entre los demás nodos.
    expect(finish.x - wait.x).toBe(wait.x - http.x);
  });

  it('W-14 con un nodo seleccionado, se inserta tras él; con Finish seleccionado, antes de Finish', () => {
    const w = build();
    const input = flow(w)[1];
    const { workflow, id } = insertNode(w, 'sql', input.id)!;
    expect(flow(workflow).map((n) => n.name ?? n.kind)).toEqual(['start', 'Input1', 'Sql1', 'Http1', 'Espera1', 'finish']);
    expect(flow(workflow)[2].id).toBe(id);
    const atFinish = insertNode(w, 'input', 'finish')!.workflow;
    expect(flow(atFinish).map((n) => n.name ?? n.kind).slice(-2)).toEqual(['Input2', 'finish']);
    // W-29: un Login seleccionado también admite un nodo tras él.
    const withLogin = insertNode(w, 'login', input.id)!;
    expect(flow(insertNode(withLogin.workflow, 'http', withLogin.id)!.workflow).map((n) => n.name ?? n.kind).slice(0, 4))
      .toEqual(['start', 'Input1', 'Login1', 'Http2']);
  });

  it('W-13 borrar un nodo intermedio une a sus vecinos; Start y Finish no se borran', () => {
    const w = build();
    const http = flow(w)[2];
    const after = removeNode(w, http.id);
    expect(flow(after).map((n) => n.name ?? n.kind)).toEqual(['start', 'Input1', 'Espera1', 'finish']);
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

describe('W-11, W-12, W-15, W-17 flechas y flujo', () => {
  it('W-12 una flecha por salida, que sustituye a la anterior; una entrada admite varias', () => {
    const w = build();
    const [, input, http, wait] = flow(w);
    const relinked = connect(w, input.id, undefined, wait.id);
    expect(flow(relinked).map((n) => n.id)).toEqual(['start', input.id, wait.id, 'finish']);
    expect(relinked.edges.filter((e) => e.from === input.id)).toHaveLength(1);
    expect(relinked.edges.filter((e) => e.to === wait.id).map((e) => e.from)).toEqual([http.id, input.id]);
    // W-15: Http1 queda fuera del flujo.
    expect(flow(relinked).some((n) => n.id === http.id)).toBe(false);
    expect(tabOrder(relinked).at(-1)!.id).toBe(http.id);
    expect(connect(w, input.id, undefined, input.id)).toBe(w);
    expect(connect(w, 'finish', undefined, input.id)).toBe(w);
    expect(connect(w, input.id, undefined, 'start')).toBe(w);
    // Una salida que el nodo no tiene.
    expect(connect(w, input.id, 'yes', wait.id)).toBe(w);
  });

  it('W-12 una flecha que cerraría un ciclo no se crea', () => {
    const w = build();
    const [, input, , wait] = flow(w);
    expect(wouldCycle(w, wait.id, input.id)).toBe(true);
    expect(connect(w, wait.id, undefined, input.id)).toBe(w);
    expect(wouldCycle(w, input.id, wait.id)).toBe(false);
  });

  it('W-15 las salidas del flujo sin flecha se marcan', () => {
    const w = build();
    const wait = flow(w)[3];
    expect(openOutputs(w)).toEqual([]);
    expect(openOutputs(removeEdge(w, wait.id))).toEqual([{ id: wait.id, out: undefined }]);
    // Un nodo suelto no cuenta.
    expect(openOutputs(insertNode(w, 'wait', null)!.workflow)).toEqual([]);
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
    const [, input, http] = flow(w);
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
    const [, input, http, wait] = flow(w);
    expect(referenceWarnings(w, http.id, '$Input1.id')).toEqual([]);
    expect(referenceWarnings(w, http.id, '$Nadie.x')).toEqual(['No hay ningún nodo llamado Nadie']);
    expect(referenceWarnings(w, input.id, '$Espera1')).toEqual(['Espera1 no va antes en el flujo: valdrá null']);
    expect(referenceWarnings(w, wait.id, '$Http1 $Http1')).toEqual([]);
  });
});

describe('W-41 mismos inputs, mismo valor', () => {
  function twoCalls(sameInputs: boolean) {
    let w = build();
    w = insertNode(w, 'sql', flow(w)[3].id)!.workflow;
    w = { ...w, options: { ...w.options, sameInputs } };
    const [, , http, , sql] = flow(w);
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

  it('W-41 al marcarla, cada nombre toma el valor del primer nodo del flujo', () => {
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
    const http = flow(w)[2];
    w = updateNode(w, http.id, { values: { id: '1', old: 'x' } });
    expect(pruneValues(w, { [http.id]: ['id', 'nuevo'] }).nodes.find((n) => n.id === http.id)!.values).toEqual({ id: '1' });
    // Sin campos conocidos, no se toca.
    expect(pruneValues(w, {})).toBe(w);
  });
});

describe('W-44, W-51, W-52 valores de consulta', () => {
  function setup(lockValues: boolean) {
    let w = build();
    const [, input, http, wait] = flow(w);
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

describe('W-12 a W-19, W-90 a W-99 control del flujo (ADR-0041)', () => {
  /** Start → Input1 → Condicion1, con «Sí» hacia Http1 y «No» hacia Espera1, y las dos ramas hacia Finish. */
  function branches(): { w: Workflow; input: string; cond: string; http: string; wait: string } {
    let w = build();
    const [, input, http, wait] = flow(w);
    const inserted = insertNode(w, 'condition', input.id)!;
    w = connect(inserted.workflow, inserted.id, 'no', wait.id);
    w = connect(w, http.id, undefined, 'finish');
    return { w, input: input.id, cond: inserted.id, http: http.id, wait: wait.id };
  }

  it('W-14 W-22 W-90 una Condición insertada sale por «Sí» hacia el siguiente y se llama Condicion1', () => {
    const { w, cond, http, wait } = branches();
    const node = w.nodes.find((n) => n.id === cond)!;
    expect(node).toMatchObject({ kind: 'condition', name: 'Condicion1', condition: '' });
    expect(w.edges).toContainEqual({ from: cond, out: 'yes', to: http });
    expect(w.edges).toContainEqual({ from: cond, out: 'no', to: wait });
    expect(flow(w).map((n) => n.name ?? n.kind)).toEqual(['start', 'Input1', 'Condicion1', 'Http1', 'Espera1', 'finish']);
    expect(openOutputs(w)).toEqual([]);
  });

  it('W-14 tras una Condición, el nodo nuevo va en su salida «Sí»', () => {
    const { w, cond, http } = branches();
    const { workflow, id } = insertNode(w, 'wait', cond)!;
    expect(workflow.edges).toContainEqual({ from: cond, out: 'yes', to: id });
    expect(workflow.edges).toContainEqual({ from: id, to: http });
  });

  it('W-14 con Finish seleccionado, el nuevo recibe todas las flechas que llegaban a Finish', () => {
    const { w, http, wait } = branches();
    const { workflow, id } = insertNode(w, 'set', 'finish')!;
    expect(workflow.edges.filter((e) => e.to === id).map((e) => e.from).sort()).toEqual([http, wait].sort());
    expect(workflow.edges.filter((e) => e.to === 'finish')).toEqual([{ from: id, to: 'finish' }]);
    expect(workflow.nodes.find((n) => n.id === id)).toMatchObject({ kind: 'set', name: 'Cambiar1', assignments: [] });
  });

  it('W-13 al borrar un nodo, todos los que llegaban a él se unen a su sucesor; una Condición solo pierde sus flechas', () => {
    const { w, input, cond, http, wait } = branches();
    const withoutWait = removeNode(w, wait);
    expect(withoutWait.edges).toContainEqual({ from: cond, out: 'no', to: 'finish' });
    expect(withoutWait.edges).toContainEqual({ from: http, to: 'finish' });
    const withoutCond = removeNode(w, cond);
    expect(withoutCond.edges.some((e) => e.from === input)).toBe(false);
    expect(withoutCond.edges.some((e) => e.from === cond || e.to === cond)).toBe(false);
  });

  it('W-12 W-17 cada salida de la Condición tiene su flecha y se borra por separado', () => {
    const { w, cond, wait } = branches();
    const replaced = connect(w, cond, 'no', 'finish');
    expect(replaced.edges.filter((e) => e.from === cond)).toHaveLength(2);
    expect(replaced.edges).toContainEqual({ from: cond, out: 'no', to: 'finish' });
    const noBranch = removeEdge(w, cond, 'no');
    expect(noBranch.edges.some((e) => e.from === cond && e.out === 'yes')).toBe(true);
    expect(openOutputs(noBranch)).toEqual([{ id: cond, out: 'no' }]);
    expect(flow(noBranch).some((n) => n.id === wait)).toBe(false);
  });

  it('W-36 en ramas, avisa de los nodos que no van antes en ningún camino', () => {
    const { w, http, wait } = branches();
    expect(referenceWarnings(w, http, '$Condicion1 $Input1.id')).toEqual([]);
    expect(referenceWarnings(w, wait, '$Http1.x')).toEqual(['Http1 no va antes en el flujo: valdrá null']);
    expect(referenceWarnings(w, 'finish', '$Http1.x $Espera1')).toEqual([]);
  });

  it('W-18 los codos se guardan ajustados a la rejilla y sin codos la flecha vuelve a ser una curva', () => {
    const { w, cond } = branches();
    const bent = setEdgePoints(w, cond, 'no', [{ x: 401, y: 247 }, { x: 0, y: 3 }]);
    expect(bent.edges.find((e) => e.from === cond && e.out === 'no')!.points).toEqual([{ x: 400, y: 240 }, { x: 0, y: 0 }]);
    expect(parseWorkflow(serializeWorkflow(bent))).toEqual(bent);
    expect(setEdgePoints(bent, cond, 'no', []).edges.find((e) => e.from === cond && e.out === 'no')).not.toHaveProperty('points');
    // La flecha que se crea al borrar o insertar un nodo no tiene codos.
    const relinked = removeNode(setEdgePoints(w, 'start', undefined, [{ x: 64, y: 64 }]), flow(w)[1].id);
    expect(relinked.edges.find((e) => e.from === 'start')).toEqual({ from: 'start', to: cond });
  });

  it('W-19 una nota soltada crea su nodo suelto donde se suelta, con su nombre y sus valores', () => {
    const w = build();
    const { workflow, id } = addNoteNode(w, 'sql', 'nota-1', 'Alta de usuario', { id: '5' }, 403, 290)!;
    expect(workflow.nodes.find((n) => n.id === id)).toEqual({
      id, kind: 'sql', name: 'AltaDeUsuario', x: 400, y: 288, noteId: 'nota-1', values: { id: '5' },
    });
    expect(workflow.edges).toEqual(w.edges);
  });

  it('W-22 nombres propuestos de los nodos nuevos', () => {
    const w = build();
    expect(proposeName(w, 'condition')).toBe('Condicion1');
    expect(proposeName(w, 'foreach')).toBe('Bucle1');
    expect(proposeName(w, 'break')).toBe('Break1');
    expect(proposeName(w, 'set')).toBe('Cambiar1');
    const twice = insertNode(insertNode(w, 'foreach', null)!.workflow, 'foreach', null)!.workflow;
    expect(twice.nodes.filter((n) => n.kind === 'foreach').map((n) => n.name)).toEqual(['Bucle1', 'Bucle2']);
  });

  it('W-50 Condición, Bucle y Cambiar valor no tienen valores de consulta', () => {
    let w = build();
    for (const kind of ['condition', 'foreach', 'break', 'set'] as const) w = insertNode(w, kind, null)!.workflow;
    const added = w.nodes.filter((n) => ['condition', 'foreach', 'break', 'set'].includes(n.kind));
    for (const n of added) expect(isEditableInView(w, n)).toBe(false);
    expect(Object.keys(savedValues(w, {})).some((id) => added.some((n) => n.id === id))).toBe(false);
  });

  it('W-91 la condición se comprueba con los mismos mensajes que el servidor', () => {
    expect(conditionProblem('$Conn1.data.total > 0 && $Input1.tipo == "A"')).toBeNull();
    expect(conditionProblem('!($A == 1) || (true && -1.5 <= $B[0]["x y"])')).toBeNull();
    expect(conditionProblem('"con \\"comillas\\"" != null')).toBeNull();
    const bad: Record<string, string> = {
      '': 'La condición está vacía',
      '$Conn1.data.total >': 'Falta un valor al final',
      '($Conn1.data.total > 0': 'Falta un paréntesis de cierre',
      '$Conn1.data.total > 0)': 'Sobra «)»',
      '$Input1.tipo == A': 'No se esperaba «A»: los textos van entre comillas',
      '$Input1.tipo == "A': 'Falta la comilla de cierre de un texto',
      '1 < 2 < 3': 'Dos comparaciones seguidas necesitan paréntesis',
      '$1 == 1': 'Tras «$» va el nombre de un nodo',
      '$Input1.tipo = "A"': 'Sobra «= "A"»',
    };
    for (const [condition, message] of Object.entries(bad)) expect(conditionProblem(condition)).toBe(message);
  });

  it('W-97 el destino es una referencia sola y no se repite', () => {
    expect(isSingleReference('$Http1.data.valor')).toBe(true);
    expect(isSingleReference('$Query1[0]["col 1"]')).toBe(true);
    for (const text of ['', 'Http1.x', '$Http1 ', ' $Http1', '$Http1.x y', '$1']) expect(isSingleReference(text)).toBe(false);
    const rows = [
      { target: '$Http1.a', value: '1' },
      { target: '$Http1.a', value: '2' },
      { target: 'Http1.b', value: '3' },
    ];
    expect(assignmentProblem(rows, 0)).toBe('Repetido');
    expect(assignmentProblem(rows, 2)).toBe('El destino es una referencia sola, como $Http1.data.valor');
  });
});
