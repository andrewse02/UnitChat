DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

CREATE TABLE users(
  user_id SERIAL PRIMARY KEY,
  first_name VARCHAR(48) NOT NULL,
  last_name VARCHAR(48) NOT NULL,
  email VARCHAR(64),
  username VARCHAR(32) NOT NULL,
  password VARCHAR(500) NOT NULL,
  profile_pic VARCHAR(120) NOT NULL,
  joined TIMESTAMPTZ NOT NULL
);

CREATE TABLE admins(
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  permission_level INTEGER NOT NULL
);

CREATE TABLE messages(
  message_id SERIAL PRIMARY KEY,
  username VARCHAR(32) NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
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
  group_id INTEGER NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  permission_level INTEGER NOT NULL,
  joined TIMESTAMPTZ NOT NULL
);

CREATE TABLE group_messages(
  group_message_id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  message_id INTEGER NOT NULL REFERENCES messages(message_id) ON DELETE CASCADE
);

CREATE TABLE group_nicknames(
  group_id INTEGER NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  group_user_id INTEGER NOT NULL REFERENCES group_users(group_user_id) ON DELETE CASCADE,
  nickname VARCHAR(32) NOT NULL
);

CREATE TABLE username_changes(
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  last_changed TIMESTAMPTZ NOT NULL
);

INSERT INTO groups(name, private, created)
VALUES('Global', false, NOW());