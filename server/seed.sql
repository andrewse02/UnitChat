DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

CREATE TABLE users(
  user_id SERIAL PRIMARY KEY,
  first_name VARCHAR(48) NOT NULL,
  last_name VARCHAR(48) NOT NULL,
  email VARCHAR(64),
  username VARCHAR(32) NOT NULL,
  password VARCHAR(500) NOT NULL,
  joined TIMESTAMPTZ NOT NULL
);

CREATE TABLE admins(
  user_id INTEGER NOT NULL REFERENCES users(user_id),
  permission_level INTEGER NOT NULL
);

CREATE TABLE messages(
  message_id SERIAL PRIMARY KEY,
  username VARCHAR(32) NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(user_id),
  text VARCHAR(1000),
  created TIMESTAMPTZ NOT NULL
);

CREATE TABLE groups(
  group_id SERIAL PRIMARY KEY,
  name VARCHAR (32) NOT NULL,
  private BOOLEAN NOT NULL,
  created TIMESTAMPTZ NOT NULL
);

CREATE TABLE group_users(
  group_user_id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES groups(group_id),
  user_id INTEGER NOT NULL REFERENCES users(user_id),
  permission_level INTEGER NOT NULL,
  joined TIMESTAMPTZ NOT NULL
);

CREATE TABLE group_messages(
  group_message_id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES groups(group_id),
  message_id INTEGER NOT NULL REFERENCES messages(message_id)
);

CREATE TABLE group_nicknames(
  group_id INTEGER NOT NULL REFERENCES groups(group_id),
  group_user_id INTEGER NOT NULL REFERENCES group_users(group_user_id),
  nickname VARCHAR(32) NOT NULL
);

CREATE TABLE username_changes(
  user_id INTEGER NOT NULL REFERENCES users(user_id),
  last_changed TIMESTAMPTZ NOT NULL
);

INSERT INTO groups(name, private, created)
VALUES('Global', false, NOW());