import type { JavaConstant } from './api';
import { migrate, readJavaConstants } from './javaConstants';

const read = (source: string) => Object.fromEntries(readJavaConstants(source));

describe('M-70 lectura del .java de constantes', () => {
  it('M-70 lee package, clase y campos static con números, textos, caracteres y booleanos', () => {
    const fields = read(`
      package demo;

      import java.math.BigDecimal;

      public final class DemoConstants {
          public static final int STATUS_ACTIVE = 1;
          public static final String LABEL = "novel";
          public static final char GRADE = 'A';
          public static final boolean ENABLED = true;
          protected static final Boolean DISABLED = false;
          static final long MAX = 5L;
          public static final double RATE = 0.25;
          private DemoConstants() {
          }
      }`);
    expect(fields).toEqual({
      'demo.DemoConstants@STATUS_ACTIVE': '1',
      'demo.DemoConstants@LABEL': 'novel',
      'demo.DemoConstants@GRADE': 'A',
      'demo.DemoConstants@ENABLED': 'true',
      'demo.DemoConstants@DISABLED': 'false',
      'demo.DemoConstants@MAX': '5',
      'demo.DemoConstants@RATE': '0.25',
    });
  });

  it('M-70 pasa los enteros a decimal y escribe los decimales como Java', () => {
    const fields = read(`
      package demo;
      class Numbers {
          static final int HEX = 0x1F;
          static final int BIN = 0b101;
          static final int OCT = 010;
          static final int BIG = 1_000_000;
          static final long LONG = 9_000_000_000L;
          static final int NEGATIVE = -3;
          static final short SHORT = (short) 1;
          static final byte BYTE = (byte) 200;
          static final float FLOAT = 1.5f;
          static final double WHOLE = 5d;
          static final double EXP = 1e3;
          static final double HALF = .5;
          static final double MINUS = -(2.5);
          static final long WIDE = (long) 7;
      }`);
    expect(fields).toEqual({
      'demo.Numbers@HEX': '31',
      'demo.Numbers@BIN': '5',
      'demo.Numbers@OCT': '8',
      'demo.Numbers@BIG': '1000000',
      'demo.Numbers@LONG': '9000000000',
      'demo.Numbers@NEGATIVE': '-3',
      'demo.Numbers@SHORT': '1',
      'demo.Numbers@BYTE': '-56',
      'demo.Numbers@FLOAT': '1.5',
      'demo.Numbers@WHOLE': '5.0',
      'demo.Numbers@EXP': '1000.0',
      'demo.Numbers@HALF': '0.5',
      'demo.Numbers@MINUS': '-2.5',
      'demo.Numbers@WIDE': '7',
    });
  });

  it('M-70 quita las comillas y aplica los escapes de textos y caracteres', () => {
    const fields = read(String.raw`
      package demo;
      class Texts {
          static final String QUOTED = "say \"hi\"";
          static final String PATH = "C:\\demo\\file";
          static final String URL = "http://example.test/a"; // no es un comentario dentro del texto
          static final String UNICODE = "\u00e1rbol";
          static final char QUOTE = '\'';
          static final String TAB = "a\tb";
      }`);
    expect(fields).toEqual({
      'demo.Texts@QUOTED': 'say "hi"',
      'demo.Texts@PATH': 'C:\\demo\\file',
      'demo.Texts@URL': 'http://example.test/a',
      'demo.Texts@UNICODE': 'árbol',
      'demo.Texts@QUOTE': "'",
      'demo.Texts@TAB': 'a\tb',
    });
  });

  it('M-70 entiende valueOf, new y los valores fijos de Boolean y BigDecimal', () => {
    const fields = read(`
      package demo;
      import java.math.BigDecimal;
      class Wrappers {
          static final Long ID = Long.valueOf(1);
          static final Integer CODE = Integer.valueOf("42");
          static final Short SMALL = Short.valueOf((short) 2);
          static final Double RATIO = Double.valueOf(3);
          static final Long OLD = new Long(9L);
          static final BigDecimal PRICE = new BigDecimal("1.50");
          static final BigDecimal TOTAL = BigDecimal.valueOf(10);
          static final java.math.BigDecimal QUALIFIED = new java.math.BigDecimal("2.5");
          static final java.math.BigInteger HUGE = new java.math.BigInteger("12345678901234567890");
          static final String NAME = String.valueOf(7);
          static final String COPY = new String("x");
          static final Boolean YES = Boolean.TRUE;
          static final Boolean NO = Boolean.valueOf("false");
          static final BigDecimal NOTHING = BigDecimal.ZERO;
          static final BigDecimal UNIT = BigDecimal.ONE;
          static final BigDecimal DECADE = BigDecimal.TEN;
      }`);
    expect(fields).toEqual({
      'demo.Wrappers@ID': '1',
      'demo.Wrappers@CODE': '42',
      'demo.Wrappers@SMALL': '2',
      'demo.Wrappers@RATIO': '3.0',
      'demo.Wrappers@OLD': '9',
      'demo.Wrappers@PRICE': '1.50',
      'demo.Wrappers@TOTAL': '10',
      'demo.Wrappers@QUALIFIED': '2.5',
      'demo.Wrappers@HUGE': '12345678901234567890',
      'demo.Wrappers@NAME': '7',
      'demo.Wrappers@COPY': 'x',
      'demo.Wrappers@YES': 'true',
      'demo.Wrappers@NO': 'false',
      'demo.Wrappers@NOTHING': '0',
      'demo.Wrappers@UNIT': '1',
      'demo.Wrappers@DECADE': '10',
    });
  });

  it('M-70 resuelve referencias a otras constantes del texto, también declaradas después', () => {
    const fields = read(`
      package demo;
      public class DemoConstants {
          public static final int ACTIVE = DEFAULT;
          public static final int DEFAULT = 1;
          public static final Long BOXED = Long.valueOf(DemoConstants.DEFAULT);
          public static final int FULL = demo.DemoConstants.DEFAULT;
          public static final int FROM_INNER = Status.OPEN;
          public static final int CYCLE_A = CYCLE_B;
          public static final int CYCLE_B = CYCLE_A;
          public static final int OUTSIDE = OtherConstants.VALUE;
          public static final int LIMIT = Integer.MAX_VALUE;

          public static final class Status {
              public static final int OPEN = 2;
              public static final int SAME = ACTIVE;
              public static final int PARENT = DemoConstants.DEFAULT;
          }
      }`);
    expect(fields).toEqual({
      'demo.DemoConstants@ACTIVE': '1',
      'demo.DemoConstants@DEFAULT': '1',
      'demo.DemoConstants@BOXED': '1',
      'demo.DemoConstants@FULL': '1',
      'demo.DemoConstants@FROM_INNER': '2',
      'demo.DemoConstants@CYCLE_A': null,
      'demo.DemoConstants@CYCLE_B': null,
      'demo.DemoConstants@OUTSIDE': null,
      'demo.DemoConstants@LIMIT': null,
      'demo.DemoConstants$Status@OPEN': '2',
      'demo.DemoConstants$Status@SAME': '1',
      'demo.DemoConstants$Status@PARENT': '1',
    });
  });

  it('M-70 nombra las clases anidadas con $ y en una interfaz lee todos los campos', () => {
    const fields = read(`
      package demo;
      public interface DemoCodes {
          int FIRST = 1;
          String LABEL = "first";
          void method();
          default int other() { return 3; }
          interface Nested {
              int SECOND = 2;
          }
          enum Kind { A, B }
      }`);
    expect(fields).toEqual({
      'demo.DemoCodes@FIRST': '1',
      'demo.DemoCodes@LABEL': 'first',
      'demo.DemoCodes$Nested@SECOND': '2',
    });
  });

  it('M-70 no lee operaciones, textos vacíos o de varias líneas ni campos sin valor inicial', () => {
    const fields = read(`
      package demo;
      class Unreadable {
          static final int TIMEOUT = 60 * 1000;
          static final String PREFIXED = "A" + "B";
          static final String EMPTY = "";
          static final String BLANK = " ";
          static final String LINES = "a\\nb";
          static final String BLOCK = """
              text
              """;
          static final int LATER;
          static final Object NOTHING = null;
          static final int CALL = compute();
          static final int[] LIST = { 1, 2 };
          static { LATER = 5; }
          static int compute() { return 1; }
      }`);
    expect(fields).toEqual({
      'demo.Unreadable@TIMEOUT': null,
      'demo.Unreadable@PREFIXED': null,
      'demo.Unreadable@EMPTY': null,
      'demo.Unreadable@BLANK': null,
      'demo.Unreadable@LINES': null,
      'demo.Unreadable@BLOCK': null,
      'demo.Unreadable@LATER': null,
      'demo.Unreadable@NOTHING': null,
      'demo.Unreadable@CALL': null,
      'demo.Unreadable@LIST': null,
    });
  });

  it('M-70 ignora comentarios, anotaciones, métodos, bloques, constantes de enum y campos que no son static', () => {
    const fields = read(`
      package demo;
      /** Constantes de la demo. */
      @SuppressWarnings("unused")
      public class DemoConstants {
          // public static final int COMMENTED = 1;
          /* public static final int BLOCK = 2; */
          @Deprecated(since = "1")
          public static final int ANNOTATED = 3, SECOND = 4;
          private final int instance = 5;
          public static final java.util.Map<String, Integer> MAP = java.util.Map.of("a", 1);
          public static final Runnable TASK = new Runnable() {
              public void run() { int hidden = 6; }
          };
          public int method() { final int local = 7; return local; }
          static { int insideBlock = 8; }
          public enum Status {
              ACTIVE(1), INACTIVE(0);
              public static final String PREFIX = "S";
              Status(int code) { }
          }
          public static final Class<?> TYPE = DemoConstants.class;
          public static final int AFTER = 9;
      }`);
    expect(fields).toEqual({
      'demo.DemoConstants@ANNOTATED': '3',
      'demo.DemoConstants@SECOND': '4',
      'demo.DemoConstants@MAP': null,
      'demo.DemoConstants@TASK': null,
      'demo.DemoConstants$Status@PREFIX': 'S',
      'demo.DemoConstants@TYPE': null,
      'demo.DemoConstants@AFTER': '9',
    });
  });

  it('M-70 sin package nombra por clase y campo; con varios ficheros cada package vale hasta el siguiente', () => {
    expect(read('class DemoConstants { static final int A = 1; }')).toEqual({ 'DemoConstants@A': '1' });
    expect(
      read(`
        package demo.one;
        class First { static final int A = 1; }
        package demo.two;
        class Second { static final int B = First.A; static final int C = demo.one.First.A; }`),
    ).toEqual({ 'demo.one.First@A': '1', 'demo.two.Second@B': null, 'demo.two.Second@C': '1' });
  });
});

const constant = (name: string, value: string | null, notes = 1): JavaConstant => {
  const at = name.indexOf('@');
  const type = name.slice(0, at);
  const dot = type.lastIndexOf('.');
  return {
    name,
    shortName: `${type.slice(dot + 1)}.${name.slice(at + 1)}`,
    packageName: dot < 0 ? '' : type.slice(0, dot),
    value,
    notes,
  };
};

describe('M-69 migración masiva', () => {
  const source = `
    package demo;
    public class DemoConstants {
        public static final int STATUS_ACTIVE = 1;
        public static final String LABEL = "novel";
        public static final int TIMEOUT = 60 * 1000;
        public static final int GONE = 4;
        public static final int UNUSED_A = 5;
        public static final int UNUSED_B = 6;
        public static final class Status {
            public static final int OPEN = 2;
        }
    }`;

  it('M-69 rellena solo las constantes de la lista, sustituye el valor y cuenta las iguales, las de fuera y las ilegibles', () => {
    const list = [
      constant('demo.DemoConstants@STATUS_ACTIVE', null),
      constant('demo.DemoConstants@LABEL', 'novel'),
      constant('demo.DemoConstants@TIMEOUT', null),
      constant('demo.DemoConstants@GONE', '9', 0),
      constant('demo.DemoConstants$Status@OPEN', '7'),
      constant('demo.OtherConstants@KEEP', 'k'),
    ];
    const drafts = Object.fromEntries(list.map((c) => [c.name, c.value ?? '']));
    expect(migrate(source, list, drafts)).toEqual({
      values: {
        'demo.DemoConstants@STATUS_ACTIVE': '1',
        'demo.DemoConstants@GONE': '4',
        'demo.DemoConstants$Status@OPEN': '2',
      },
      same: 1,
      outside: 2,
      unreadable: ['DemoConstants.TIMEOUT'],
    });
  });

  it('M-69 compara con lo que hay escrito en la tabla, no solo con lo guardado', () => {
    const list = [constant('demo.DemoConstants@LABEL', 'novel')];
    expect(migrate(source, list, { 'demo.DemoConstants@LABEL': 'edited' })?.values).toEqual({
      'demo.DemoConstants@LABEL': 'novel',
    });
  });

  it('M-69 un texto sin package casa por clase y campo en cualquier paquete', () => {
    const list = [constant('demo.DemoConstants@STATUS_ACTIVE', null), constant('other.DemoConstants@LABEL', null)];
    const result = migrate('class DemoConstants { static final int STATUS_ACTIVE = 3; static final String LABEL = "x"; }', list, {});
    expect(result?.values).toEqual({ 'demo.DemoConstants@STATUS_ACTIVE': '3', 'other.DemoConstants@LABEL': 'x' });
  });

  it('M-69 con package solo casa con ese paquete', () => {
    const list = [constant('other.DemoConstants@STATUS_ACTIVE', null)];
    expect(migrate(source, list, {})).toEqual({ values: {}, same: 0, outside: 7, unreadable: [] });
  });

  it('M-69 un texto sin constantes devuelve null', () => {
    expect(migrate('esto no es Java', [constant('demo.DemoConstants@LABEL', null)], {})).toBeNull();
    expect(migrate('', [], {})).toBeNull();
  });
});
