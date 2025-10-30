# frozen_string_literal: true

require "sinatra/base"
require "json"
require "jwt"

begin
  require "dotenv/load"
rescue LoadError
  # Dotenv is optional; ignore if not installed (e.g., production)
end

class EmailDemoApp < Sinatra::Base
  class MissingConfigError < StandardError; end
  set :bind, "0.0.0.0"
  set :port, ENV.fetch("PORT", 4567)
  set :server, :puma

  configure do
    enable :logging
    set :protection, except: :json_csrf
  end

  before do
    response.headers["Access-Control-Allow-Origin"] = ENV.fetch("CORS_ALLOW_ORIGIN", "*")
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
  end

  options "*" do
    204
  end

  get "/api/health" do
    content_type :json
    { status: "ok" }.to_json
  end

  get "/api/rollout/token" do
    content_type :json

    user_id = params["user_id"].to_s.strip
    user_id = default_rollout_user_id if user_id.empty?

    token = generate_rollout_token(user_id)
    { token: token, user_id: user_id }.to_json
  rescue MissingConfigError => e
    status 500
    { error: e.message }.to_json
  rescue StandardError => e
    logger.error("Rollout token generation failed: #{e.message}")
    status 500
    { error: "Failed to generate token" }.to_json
  end

  not_found do
    content_type :json
    status 404
    { error: "Not Found" }.to_json
  end

  error do
    content_type :json
    status 500
    { error: env["sinatra.error"].message }.to_json
  end

  private

  def generate_rollout_token(user_id)
    client_id = ENV["ROLLOUT_CLIENT_ID"]
    client_secret = ENV["ROLLOUT_CLIENT_SECRET"]
    raise MissingConfigError, "ROLLOUT_CLIENT_ID not configured" if client_id.to_s.empty?
    raise MissingConfigError, "ROLLOUT_CLIENT_SECRET not configured" if client_secret.to_s.empty?

    now = Time.now.to_i
    payload = {
      iss: client_id,
      sub: user_id,
      iat: now,
      exp: now + 900 # 15 minutes
    }

    JWT.encode(payload, client_secret, "HS512")
  end

  def default_rollout_user_id
    ENV.fetch("ROLLOUT_DEFAULT_USER_ID", "demo-email-user")
  end
end

EmailDemoApp.run! if $PROGRAM_NAME == __FILE__

