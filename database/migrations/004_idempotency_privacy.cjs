exports.up = (pgm) => {
  pgm.addConstraint('api_idempotency_records', 'api_idempotency_safe_response', {
    check: 'careorbit_safe_operational_json(response_body)',
  });
};

exports.down = (pgm) => pgm.dropConstraint('api_idempotency_records', 'api_idempotency_safe_response');
