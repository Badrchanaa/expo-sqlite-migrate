import React, { useEffect, useMemo, useState } from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";
import * as SQLite from "expo-sqlite";
import { Migrator } from "expo-sqlite-migrate";
import { Constraint, DropTable, Table } from "expo-sqlite-migrate";

type TestState = {
  status: "idle" | "running" | "pass" | "fail";
  message: string;
  steps: TestStep[];
  logs: string[];
};

type TestStep = {
  name: string;
  status: "pending" | "pass" | "fail";
  detail?: string;
};

const expectedRollbackStatus = 2;
const expectedRollbackId = "third";

function nowStamp(): string {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}

async function runIntegrationTest(
  log: (message: string) => void,
  updateStep: (name: string, status: TestStep["status"], detail?: string) => void,
): Promise<void> {
  const db = await SQLite.openDatabaseAsync("integration.db");

  log("Dropping existing tables");
  await db.execAsync("DROP TABLE IF EXISTS t3");
  await db.execAsync("DROP TABLE IF EXISTS t2");
  await db.execAsync("DROP TABLE IF EXISTS t1");
  await db.execAsync("DROP TABLE IF EXISTS migrations");

  updateStep("Migrate up", "pending");
  const migrator = await Migrator.create(db, "expo-sqlite");
  const migrations = [
    {
      id: "first",
      up: () => {
        const sql = [
          new Table("t1")
            .addField("id", "int", Constraint.PRIMARY_KEY)
            .addField("name", "text", Constraint.NOT_NULL)
            .create(),
        ];
        log(`Migration first up: ${sql.join(" | ")}`);
        return sql;
      },
      down: () => [DropTable("t1")],
    },
    {
      id: "second",
      up: () => {
        const sql = [
          new Table("t2")
            .addField("id", "int", Constraint.PRIMARY_KEY)
            .addField("t1_id", "int", Constraint.NOT_NULL)
            .create(),
        ];
        log(`Migration second up: ${sql.join(" | ")}`);
        return sql;
      },
      down: () => [DropTable("t2")],
    },
    {
      id: "third",
      up: () => {
        const sql = [
          new Table("t3")
            .addField("id", "int", Constraint.PRIMARY_KEY)
            .addField("note", "text")
            .create(),
        ];
        log(`Migration third up: ${sql.join(" | ")}`);
        return sql;
      },
      down: () => [DropTable("t3")],
    },
  ];
  await migrator.migrate(migrations);
  updateStep("Migrate up", "pass");

  updateStep("Verify tables", "pending");
  const tables = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
  );
  log(`Tables after migrate: ${tables.map((t) => t.name).join(", ")}`);
  const tableNames = new Set(tables.map((t) => t.name));
  if (!tableNames.has("t1") || !tableNames.has("t2") || !tableNames.has("t3")) {
    updateStep("Verify tables", "fail", "missing tables after migrate");
    throw new Error("expected tables not created");
  }
  updateStep("Verify tables", "pass");

  updateStep("Insert data", "pending");
  await db.execAsync("INSERT INTO t1 (id, name) VALUES (1, 'alpha')");
  await db.execAsync("INSERT INTO t2 (id, t1_id) VALUES (10, 1)");
  await db.execAsync("INSERT INTO t3 (id, note) VALUES (100, 'note')");
  const counts = await db.getAllAsync<{ name: string; count: number }>(
    "SELECT 't1' as name, COUNT(*) as count FROM t1 UNION ALL " +
      "SELECT 't2' as name, COUNT(*) as count FROM t2 UNION ALL " +
      "SELECT 't3' as name, COUNT(*) as count FROM t3",
  );
  log(
    `Row counts: ${counts.map((row) => `${row.name}=${row.count}`).join(", ")}`,
  );
  updateStep("Insert data", "pass");

  updateStep("Rollback last migration", "pending");
  const rolledBack = await migrator.rollback();
  log(`Rollback result: ${rolledBack ?? "none"}`);
  if (rolledBack !== expectedRollbackId) {
    updateStep("Rollback last migration", "fail", `got ${String(rolledBack)}`);
    throw new Error(
      `expected rollback "${expectedRollbackId}", got "${rolledBack}"`,
    );
  }
  updateStep("Rollback last migration", "pass");

  updateStep("Verify rollback status", "pending");
  const record = await db.getFirstAsync<{ status: number }>(
    "SELECT status FROM migrations WHERE id = ?",
    [expectedRollbackId],
  );
  if (!record || record.status !== expectedRollbackStatus) {
    updateStep("Verify rollback status", "fail", "migrations row mismatch");
    throw new Error("rollback status not recorded");
  }
  updateStep("Verify rollback status", "pass");

  updateStep("Verify table drop", "pending");
  const rolledBackTable = await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='t3'",
  );
  if (rolledBackTable) {
    updateStep("Verify table drop", "fail", "t3 still exists");
    throw new Error("t3 table still exists after rollback");
  }
  updateStep("Verify table drop", "pass");

  updateStep("Final table list", "pending");
  const finalTables = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
  );
  const finalTableNames = finalTables.map((t) => t.name);
  log(`Final tables: ${finalTableNames.join(", ")}`);
  const finalSet = new Set(finalTableNames);
  if (!finalSet.has("t1") || !finalSet.has("t2") || finalSet.has("t3")) {
    updateStep(
      "Final table list",
      "fail",
      "expected t1/t2 only after rollback",
    );
    throw new Error("final table set mismatch after rollback");
  }
  updateStep("Final table list", "pass");
}

export default function App() {
  const initialSteps = useMemo<TestStep[]>(
    () => [
      { name: "Migrate up", status: "pending" },
      { name: "Verify tables", status: "pending" },
      { name: "Insert data", status: "pending" },
      { name: "Rollback last migration", status: "pending" },
      { name: "Verify rollback status", status: "pending" },
      { name: "Verify table drop", status: "pending" },
      { name: "Final table list", status: "pending" },
    ],
    [],
  );

  const [state, setState] = useState<TestState>({
    status: "idle",
    message: "Idle",
    steps: initialSteps,
    logs: [],
  });

  useEffect(() => {
    let mounted = true;
    setState((prev) => ({
      ...prev,
      status: "running",
      message: "Running integration test...",
      steps: initialSteps,
      logs: [],
    }));

    const addLog = (message: string) => {
      const entry = `[${nowStamp()}] ${message}`;
      console.log(entry);
      if (mounted) {
        setState((prev) => ({ ...prev, logs: [entry, ...prev.logs] }));
      }
    };

    const updateStep = (
      name: string,
      status: TestStep["status"],
      detail?: string,
    ) => {
      if (!mounted) return;
      setState((prev) => ({
        ...prev,
        steps: prev.steps.map((step) =>
          step.name === name ? { ...step, status, detail } : step,
        ),
      }));
    };

    runIntegrationTest(addLog, updateStep)
      .then(() => {
        if (mounted) {
          setState((prev) => ({
            ...prev,
            status: "pass",
            message: "PASS: all checks completed",
          }));
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        if (mounted) {
          setState((prev) => ({
            ...prev,
            status: "fail",
            message: `FAIL: ${message}`,
          }));
        }
      });
    return () => {
      mounted = false;
    };
  }, [initialSteps]);

  const statusStyle =
    state.status === "pass"
      ? styles.pass
      : state.status === "fail"
        ? styles.fail
        : styles.running;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Expo SQLite Migrate</Text>
        <Text style={styles.subtitle}>Integration Test</Text>
        <Text style={[styles.status, statusStyle]}>{state.message}</Text>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Checks</Text>
          {state.steps.map((step) => (
            <View key={step.name} style={styles.row}>
              <Text style={styles.stepName}>{step.name}</Text>
              <Text
                style={[
                  styles.stepStatus,
                  step.status === "pass"
                    ? styles.pass
                    : step.status === "fail"
                      ? styles.fail
                      : styles.running,
                ]}
              >
                {step.status.toUpperCase()}
              </Text>
            </View>
          ))}
          {state.steps.some((step) => step.detail) && (
            <View style={styles.detailList}>
              {state.steps
                .filter((step) => step.detail)
                .map((step) => (
                  <Text key={step.name} style={styles.detail}>
                    {step.name}: {step.detail}
                  </Text>
                ))}
            </View>
          )}
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Logs</Text>
          {state.logs.length === 0 ? (
            <Text style={styles.logLine}>No logs yet.</Text>
          ) : (
            state.logs.slice(0, 12).map((line) => (
              <Text key={line} style={styles.logLine}>
                {line}
              </Text>
            ))
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f7f3ee",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#fff6e8",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#e7d9c6",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#2c1c10",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#6f5744",
    marginBottom: 16,
  },
  status: {
    fontSize: 16,
    fontWeight: "600",
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#3a2a1e",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(85, 64, 48, 0.15)",
  },
  stepName: {
    flex: 1,
    fontSize: 14,
    color: "#2c1c10",
  },
  stepStatus: {
    fontSize: 12,
    fontWeight: "700",
  },
  detailList: {
    marginTop: 8,
    paddingLeft: 4,
  },
  detail: {
    fontSize: 12,
    color: "#6f5744",
    marginTop: 4,
  },
  logLine: {
    fontSize: 11,
    color: "#6f5744",
    marginTop: 4,
  },
  running: {
    color: "#8b6c4a",
  },
  pass: {
    color: "#1b5f3a",
  },
  fail: {
    color: "#9c2c2c",
  },
});
