import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const configurations = sqliteTable('configurations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  value: text('value').notNull().default(''),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

export const miniApps = sqliteTable('mini_apps', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  icon: text('icon').notNull().default('Box'),
  category: text('category').notNull().default('Custom'),
  version: text('version').notNull().default('1.0.0'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  shortcut: text('shortcut'),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

export const miniAppStorage = sqliteTable('mini_app_storage', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  appId: text('app_id').notNull(),
  key: text('key').notNull(),
  value: text('value').notNull().default(''),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

export type ConfigurationEntry = typeof configurations.$inferSelect
export type NewConfigurationEntry = typeof configurations.$inferInsert
export type MiniAppEntry = typeof miniApps.$inferSelect
export type NewMiniAppEntry = typeof miniApps.$inferInsert
export type MiniAppStorageEntry = typeof miniAppStorage.$inferSelect
export type NewMiniAppStorageEntry = typeof miniAppStorage.$inferInsert
