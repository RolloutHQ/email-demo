# frozen_string_literal: true

require "sinatra/base"
require "json"
require "jwt"
require "net/http"
require "uri"

begin
  require "dotenv/load"
rescue LoadError
  # Dotenv is optional; ignore if not installed (e.g., production)
end

class EmailDemoApp < Sinatra::Base
  # Define custom error early so it's available in rescues
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

  # removed legacy demo route `/api/items`

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

  # Smart list proxy route
  post "/api/rollout/smart-lists" do
    content_type :json

    payload = parse_json_body(request.body.read)
    credential_id = payload["credentialId"].to_s.strip
    list_name = payload["name"].to_s.strip
    tag_name = payload["tagName"].to_s.strip

    halt 422, { error: "credentialId is required" }.to_json if credential_id.empty?
    halt 422, { error: "name is required" }.to_json if list_name.empty?
    halt 422, { error: "tagName is required" }.to_json if tag_name.empty?

    response = create_rollout_smart_list(
      credential_id: credential_id,
      name: list_name,
      tag_name: tag_name
    )

    log_rollout_response(
      response: response,
      credential_id: credential_id,
      list_name: list_name,
      tag_name: tag_name
    )

    forward_rollout_response(response)
  rescue MissingConfigError => e
    status 500
    { error: e.message }.to_json
  rescue JSON::ParserError
    halt 400, { error: "Invalid JSON body" }.to_json
  rescue StandardError => e
    logger.error("Smart list creation failed: #{e.class} - #{e.message}")
    status 500
    { error: "Failed to create smart list" }.to_json
  end

  # Person proxy route
  post "/api/rollout/people" do
    content_type :json

    payload = parse_json_body(request.body.read)
    credential_id = payload["credentialId"].to_s.strip
    person_data = payload["person"]

    halt 422, { error: "credentialId is required" }.to_json if credential_id.empty?
    halt 422, { error: "person payload is required" }.to_json unless person_data.is_a?(Hash)

    response = create_rollout_person(
      credential_id: credential_id,
      person: person_data
    )

    log_rollout_person_response(
      response: response,
      credential_id: credential_id,
      person: person_data
    )

    forward_rollout_response(response)
  rescue MissingConfigError => e
    status 500
    { error: e.message }.to_json
  rescue JSON::ParserError
    halt 400, { error: "Invalid JSON body" }.to_json
  rescue StandardError => e
    logger.error("Person creation failed: #{e.class} - #{e.message}")
    status 500
    { error: "Failed to create person" }.to_json
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

  # trimmed: removed unused sample_items

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

  def parse_json_body(body)
    return {} if body.to_s.strip.empty?

    JSON.parse(body)
  end

  def rollout_api_base_url
    ENV.fetch("ROLLOUT_API_BASE_URL", "https://crm.universal.rollout.com/")
  end

  def create_rollout_smart_list(credential_id:, name:, tag_name:)
    uri = URI.join(rollout_api_base_url, "api/smart-lists")

    request_payload = {
      name: name,
      conditions: [
        [
          {
            fld: "tags",
            opr: "include any of",
            num: nil,
            unit: "",
            val: [tag_name]
          }
        ]
      ]
    }

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == "https"

    token = generate_rollout_token(default_rollout_user_id)

    log_rollout_request(
      label: "smart-list",
      method: "POST",
      uri: uri,
      credential_id: credential_id,
      token: token,
      payload: request_payload
    )

    request = Net::HTTP::Post.new(uri)
    request["Content-Type"] = "application/json"
    request["Authorization"] = "Bearer #{token}"
    request["x-rollout-credential-id"] = credential_id
    request.body = JSON.generate(request_payload)

    http.request(request)
  end

  def create_rollout_person(credential_id:, person:)
    uri = URI.join(rollout_api_base_url, "api/people")

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == "https"

    token = generate_rollout_token(default_rollout_user_id)

    log_rollout_request(
      label: "person",
      method: "POST",
      uri: uri,
      credential_id: credential_id,
      token: token,
      payload: person
    )

    request = Net::HTTP::Post.new(uri)
    request["Content-Type"] = "application/json"
    request["Authorization"] = "Bearer #{token}"
    request["x-rollout-credential-id"] = credential_id
    request.body = JSON.generate(person)

    http.request(request)
  end

  def forward_rollout_response(response)
    status response.code.to_i
    body = response.body.to_s

    if body.empty?
      {}.to_json
    else
      begin
        JSON.parse(body).to_json
      rescue JSON::ParserError
        { raw: body }.to_json
      end
    end
  end

  def log_rollout_response(response:, credential_id:, list_name:, tag_name:)
    payload = {
      credential_id: credential_id,
      smart_list_name: list_name,
      tag_name: tag_name,
      status: response.code.to_i,
      headers: response.to_hash,
      body: response.body.to_s
    }

    logger.info("[email-demo:smart-list] #{payload.to_json}")
  rescue StandardError => e
    logger.warn("Failed to log email demo smart list response: #{e.message}")
  end

  def log_rollout_request(label:, method:, uri:, credential_id:, token:, payload:)
    curl = [
      "curl",
      "-X #{method}",
      "\"#{uri}\"",
      "-H 'Content-Type: application/json'",
      "-H 'Authorization: Bearer #{token}'",
      "-H 'x-rollout-credential-id: #{credential_id}'",
      "-d '#{JSON.generate(payload)}'"
    ].join(" \\\n  ")

    logger.info("[rollout-request:#{label}] #{curl}")
  rescue StandardError => e
    logger.warn("Failed to log Rollout request: #{e.message}")
  end

  def log_rollout_person_response(response:, credential_id:, person:)
    payload = {
      credential_id: credential_id,
      person: person,
      status: response.code.to_i,
      headers: response.to_hash,
      body: response.body.to_s
    }

    logger.info("[email-demo:person] #{payload.to_json}")
  rescue StandardError => e
    logger.warn("Failed to log email demo person response: #{e.message}")
  end

end

EmailDemoApp.run! if $PROGRAM_NAME == __FILE__
