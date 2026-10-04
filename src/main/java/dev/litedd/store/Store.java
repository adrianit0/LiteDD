package dev.litedd.store;

import dev.litedd.notes.NoteMapper;
import dev.litedd.session.SessionMapper;
import dev.litedd.settings.SettingMapper;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.apache.ibatis.transaction.managed.ManagedTransactionFactory;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteDataSource;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.Properties;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Function;

/**
 * Acceso a SQLite: una conexión de escritura serializada y varias de lectura en paralelo (D-07),
 * con los PRAGMA de D-01 y mappers de MyBatis con anotaciones (D-06).
 */
public final class Store implements AutoCloseable {

    private static final int READERS = 3;

    private final SqlSessionFactory factory;
    private final Connection writer;
    private final ReentrantLock writeLock = new ReentrantLock();
    private final BlockingQueue<Connection> readers = new ArrayBlockingQueue<>(READERS);

    private Store(SqlSessionFactory factory, Connection writer) {
        this.factory = factory;
        this.writer = writer;
    }

    public static Store open(Path dbFile, Path backupDir) {
        try {
            Files.createDirectories(dbFile.toAbsolutePath().getParent());
            String url = "jdbc:sqlite:" + dbFile.toAbsolutePath();

            Connection writer = config(false).createConnection(url);
            new Migrator(Migrator.MIGRATIONS, backupDir).migrate(writer);
            writer.setAutoCommit(false);

            Store store = new Store(sessionFactory(url), writer);
            for (int i = 0; i < READERS; i++) {
                store.readers.add(config(true).createConnection(url));
            }
            return store;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } catch (SQLException e) {
            throw new IllegalStateException("No se puede abrir la base de datos " + dbFile, e);
        }
    }

    /** Ejecuta una unidad de trabajo de escritura en una transacción, una cada vez. */
    public <T> T write(Function<SqlSession, T> work) {
        writeLock.lock();
        try (SqlSession session = factory.openSession(writer)) {
            try {
                T result = work.apply(session);
                writer.commit();
                return result;
            } catch (RuntimeException | Error e) {
                rollbackQuietly(e);
                throw e;
            } catch (SQLException e) {
                rollbackQuietly(e);
                throw new IllegalStateException(e);
            }
        } finally {
            writeLock.unlock();
        }
    }

    /** Ejecuta una lectura en una de las conexiones de solo lectura. */
    public <T> T read(Function<SqlSession, T> work) {
        Connection c;
        try {
            c = readers.take();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
        try (SqlSession session = factory.openSession(c)) {
            return work.apply(session);
        } finally {
            readers.add(c);
        }
    }

    @Override
    public void close() {
        writeLock.lock();
        try {
            closeQuietly(writer);
            readers.forEach(Store::closeQuietly);
        } finally {
            writeLock.unlock();
        }
    }

    private void rollbackQuietly(Throwable cause) {
        try {
            writer.rollback();
        } catch (SQLException e) {
            cause.addSuppressed(e);
        }
    }

    private static void closeQuietly(Connection c) {
        try {
            c.close();
        } catch (SQLException ignored) {
            // Cierre al apagar: no hay nada más que hacer.
        }
    }

    /** D-01: estos PRAGMA se aplican al abrir cada conexión. */
    private static SQLiteConfig config(boolean readOnly) {
        SQLiteConfig cfg = new SQLiteConfig();
        cfg.enforceForeignKeys(true);
        cfg.setJournalMode(SQLiteConfig.JournalMode.WAL);
        cfg.setSynchronous(SQLiteConfig.SynchronousMode.NORMAL);
        cfg.setBusyTimeout(5000);
        cfg.setReadOnly(readOnly);
        return cfg;
    }

    private static SqlSessionFactory sessionFactory(String url) {
        // Las conexiones las gestiona Store; MyBatis no debe cerrarlas.
        ManagedTransactionFactory tx = new ManagedTransactionFactory();
        Properties props = new Properties();
        props.setProperty("closeConnection", "false");
        tx.setProperties(props);
        SQLiteDataSource unused = new SQLiteDataSource();
        unused.setUrl(url);

        Configuration cfg = new Configuration(new Environment("litedd", tx, unused));
        cfg.setMapUnderscoreToCamelCase(true);
        cfg.setArgNameBasedConstructorAutoMapping(true);
        cfg.addMapper(NoteMapper.class);
        cfg.addMapper(SettingMapper.class);
        cfg.addMapper(SessionMapper.class);
        return new SqlSessionFactoryBuilder().build(cfg);
    }
}
