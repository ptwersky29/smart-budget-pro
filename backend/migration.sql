-- Smart Budget Pro - PostgreSQL Migration
-- Paste this into Supabase SQL Editor

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop existing tables if re-running
DROP TABLE IF EXISTS ai_usage CASCADE;
DROP TABLE IF EXISTS ai_messages CASCADE;

CREATE TABLE ai_messages (
	id SERIAL NOT NULL, 
	user_id VARCHAR(64) NOT NULL, 
	session_id VARCHAR(64) NOT NULL, 
	role VARCHAR(16) NOT NULL, 
	content TEXT NOT NULL, 
	provider VARCHAR(32), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id)
)

;


CREATE TABLE ai_providers (
	id SERIAL NOT NULL, 
	user_id VARCHAR(64) NOT NULL, 
	name VARCHAR(32) NOT NULL, 
	api_key TEXT NOT NULL, 
	is_default BOOLEAN NOT NULL, 
	config JSON, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_ai_providers_user_name UNIQUE (user_id, name)
)

;


CREATE TABLE ai_usage (
	id SERIAL NOT NULL, 
	user_id VARCHAR(64) NOT NULL, 
	date TIMESTAMP WITH TIME ZONE NOT NULL, 
	prompt_tokens INTEGER NOT NULL, 
	completion_tokens INTEGER NOT NULL, 
	cost FLOAT NOT NULL, 
	provider VARCHAR(32), 
	endpoint VARCHAR(64), 
	PRIMARY KEY (id)
)

;


CREATE TABLE app_config (
	id SERIAL NOT NULL, 
	key VARCHAR(128) NOT NULL, 
	value TEXT, 
	PRIMARY KEY (id)
)

;


CREATE TABLE billing_records (
	id SERIAL NOT NULL, 
	user_id VARCHAR(64) NOT NULL, 
	stripe_session_id VARCHAR(255), 
	email VARCHAR(255), 
	amount FLOAT NOT NULL, 
	currency VARCHAR(3) NOT NULL, 
	package VARCHAR(64), 
	status VARCHAR(32) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id)
)

;


CREATE TABLE budgets (
	id SERIAL NOT NULL, 
	budget_id VARCHAR(64) NOT NULL, 
	user_id VARCHAR(64) NOT NULL, 
	category VARCHAR(128) NOT NULL, 
	amount FLOAT NOT NULL, 
	period VARCHAR(16) NOT NULL, 
	start_date TIMESTAMP WITH TIME ZONE, 
	end_date TIMESTAMP WITH TIME ZONE, 
	notes TEXT, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	UNIQUE (budget_id)
)

;


CREATE TABLE integrations (
	id SERIAL NOT NULL, 
	user_id VARCHAR(64) NOT NULL, 
	provider VARCHAR(32) NOT NULL, 
	config JSON, 
	enabled BOOLEAN NOT NULL, 
	label VARCHAR(128), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_integrations_user_provider UNIQUE (user_id, provider)
)

;


CREATE TABLE maaser_ledger (
	id SERIAL NOT NULL, 
	user_id VARCHAR(64) NOT NULL, 
	transaction_id VARCHAR(64), 
	income_amount FLOAT NOT NULL, 
	maaser_due FLOAT NOT NULL, 
	maaser_paid FLOAT NOT NULL, 
	paid_to VARCHAR(255), 
	note TEXT, 
	date TIMESTAMP WITH TIME ZONE NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id)
)

;


CREATE TABLE password_reset_tokens (
	id SERIAL NOT NULL, 
	user_id VARCHAR(64) NOT NULL, 
	token VARCHAR(256) NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (token)
)

;


CREATE TABLE payment_transactions (
	id SERIAL NOT NULL, 
	session_id VARCHAR(128) NOT NULL, 
	oid VARCHAR(128), 
	provider VARCHAR(16) NOT NULL, 
	user_id VARCHAR(64), 
	user_email VARCHAR(255), 
	user_name VARCHAR(255), 
	origin TEXT, 
	amount FLOAT NOT NULL, 
	currency VARCHAR(3) NOT NULL, 
	package_id VARCHAR(64), 
	payment_status VARCHAR(32) NOT NULL, 
	status VARCHAR(32), 
	approval_code VARCHAR(128), 
	ipg_transaction_id VARCHAR(128), 
	signature_valid BOOLEAN, 
	raw_response JSON, 
	notify_received_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id)
)

;


CREATE TABLE pending_updates (
	id SERIAL NOT NULL, 
	user_id VARCHAR(64) NOT NULL, 
	transaction_id VARCHAR(64), 
	field VARCHAR(64) NOT NULL, 
	old_value TEXT, 
	new_value TEXT, 
	applied BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id)
)

;


CREATE TABLE recurring_transactions (
	id SERIAL NOT NULL, 
	user_id VARCHAR(64) NOT NULL, 
	description VARCHAR(255) NOT NULL, 
	amount FLOAT NOT NULL, 
	category VARCHAR(128), 
	frequency VARCHAR(32) NOT NULL, 
	next_date TIMESTAMP WITH TIME ZONE, 
	active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id)
)

;


CREATE TABLE sms_messages (
	id SERIAL NOT NULL, 
	user_id VARCHAR(64) NOT NULL, 
	to_number VARCHAR(32) NOT NULL, 
	body TEXT NOT NULL, 
	status VARCHAR(32) NOT NULL, 
	provider VARCHAR(32) NOT NULL, 
	external_id VARCHAR(255), 
	direction VARCHAR(8) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id)
)

;


CREATE TABLE statements (
	id SERIAL NOT NULL, 
	user_id VARCHAR(64) NOT NULL, 
	account_id VARCHAR(128), 
	period_start TIMESTAMP WITH TIME ZONE, 
	period_end TIMESTAMP WITH TIME ZONE, 
	total_income FLOAT NOT NULL, 
	total_expenses FLOAT NOT NULL, 
	net_savings FLOAT NOT NULL, 
	currency VARCHAR(3) NOT NULL, 
	status VARCHAR(32) NOT NULL, 
	data JSON, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id)
)

;


CREATE TABLE token_blacklist (
	id SERIAL NOT NULL, 
	jti VARCHAR(128) NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
)

;


CREATE TABLE transactions (
	id SERIAL NOT NULL, 
	transaction_id VARCHAR(64) NOT NULL, 
	user_id VARCHAR(64) NOT NULL, 
	account_id VARCHAR(128), 
	connection_id VARCHAR(128), 
	amount FLOAT NOT NULL, 
	currency VARCHAR(3) NOT NULL, 
	description TEXT, 
	category VARCHAR(128), 
	subcategory VARCHAR(128), 
	date TIMESTAMP WITH TIME ZONE NOT NULL, 
	notes TEXT, 
	tags JSON, 
	merchant_name VARCHAR(255), 
	pending BOOLEAN NOT NULL, 
	tx_type VARCHAR(32), 
	exclude_from_maaser BOOLEAN NOT NULL, 
	source VARCHAR(32) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id)
)

;


CREATE TABLE truelayer_logs (
	id SERIAL NOT NULL, 
	user_id VARCHAR(64), 
	endpoint VARCHAR(255), 
	status_code INTEGER, 
	request_body JSON, 
	response_body JSON, 
	error TEXT, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
)

;


CREATE TABLE truelayer_states (
	id SERIAL NOT NULL, 
	state VARCHAR(128) NOT NULL, 
	user_id VARCHAR(64) NOT NULL, 
	redirect_uri TEXT, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
)

;


CREATE TABLE users (
	id SERIAL NOT NULL, 
	user_id VARCHAR(64) NOT NULL, 
	email VARCHAR(255) NOT NULL, 
	name VARCHAR(255), 
	picture VARCHAR(512),
	hashed_password VARCHAR(255) NOT NULL, 
	google_sub VARCHAR(128),
	tier VARCHAR(32) NOT NULL, 
	is_admin BOOLEAN NOT NULL, 
	onboarded BOOLEAN NOT NULL, 
	onboarding_step VARCHAR(64), 
	preferences JSON, 
	disabled BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id)
)

;


CREATE TABLE bank_connections (
	id SERIAL NOT NULL, 
	user_id VARCHAR(64) NOT NULL, 
	connection_id VARCHAR(128) NOT NULL, 
	provider VARCHAR(32) NOT NULL, 
	account_id VARCHAR(128), 
	account_name VARCHAR(255), 
	account_type VARCHAR(64), 
	access_token TEXT, 
	refresh_token TEXT, 
	expires_at TIMESTAMP WITH TIME ZONE, 
	status VARCHAR(32) NOT NULL, 
	config JSON, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (user_id)
)

;


CREATE TABLE user_sessions (
	id SERIAL NOT NULL, 
	user_id VARCHAR(64) NOT NULL, 
	session_token VARCHAR(512) NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (user_id), 
	UNIQUE (session_token)
)

;

