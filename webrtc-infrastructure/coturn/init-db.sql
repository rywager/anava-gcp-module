-- Initialize coturn database schema
-- This is used for persistent user storage and statistics

-- Create tables for turn server
CREATE TABLE IF NOT EXISTS turnusers_lt (
    realm VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    hmackey VARCHAR(255) NOT NULL,
    PRIMARY KEY (realm, name)
);

CREATE TABLE IF NOT EXISTS turn_secret (
    realm VARCHAR(255) NOT NULL,
    value VARCHAR(255) NOT NULL,
    PRIMARY KEY (realm, value)
);

CREATE TABLE IF NOT EXISTS allowed_peer_ip (
    realm VARCHAR(255) NOT NULL,
    ip_range VARCHAR(255) NOT NULL,
    PRIMARY KEY (realm, ip_range)
);

CREATE TABLE IF NOT EXISTS denied_peer_ip (
    realm VARCHAR(255) NOT NULL,
    ip_range VARCHAR(255) NOT NULL,
    PRIMARY KEY (realm, ip_range)
);

CREATE TABLE IF NOT EXISTS turn_origin_to_realm (
    origin VARCHAR(255) NOT NULL,
    realm VARCHAR(255) NOT NULL,
    PRIMARY KEY (origin, realm)
);

CREATE TABLE IF NOT EXISTS turn_realm_option (
    realm VARCHAR(255) NOT NULL,
    opt VARCHAR(255) NOT NULL,
    value VARCHAR(255),
    PRIMARY KEY (realm, opt)
);

CREATE TABLE IF NOT EXISTS oauth_key (
    kid VARCHAR(255) NOT NULL,
    ikm_key VARCHAR(255) NOT NULL,
    timestamp BIGINT NOT NULL DEFAULT 0,
    lifetime INTEGER NOT NULL DEFAULT 0,
    as_rs_alg VARCHAR(255) NOT NULL,
    realm VARCHAR(255),
    PRIMARY KEY (kid)
);

CREATE TABLE IF NOT EXISTS admin_user (
    name VARCHAR(255) NOT NULL,
    realm VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    PRIMARY KEY (name)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS turnusers_lt_realm_idx ON turnusers_lt(realm);
CREATE INDEX IF NOT EXISTS turn_secret_realm_idx ON turn_secret(realm);
CREATE INDEX IF NOT EXISTS allowed_peer_ip_realm_idx ON allowed_peer_ip(realm);
CREATE INDEX IF NOT EXISTS denied_peer_ip_realm_idx ON denied_peer_ip(realm);
CREATE INDEX IF NOT EXISTS turn_origin_to_realm_realm_idx ON turn_origin_to_realm(realm);
CREATE INDEX IF NOT EXISTS turn_realm_option_realm_idx ON turn_realm_option(realm);
CREATE INDEX IF NOT EXISTS oauth_key_realm_idx ON oauth_key(realm);
CREATE INDEX IF NOT EXISTS admin_user_realm_idx ON admin_user(realm);

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO coturn;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO coturn;