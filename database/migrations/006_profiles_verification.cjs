exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE doctor_profiles ADD COLUMN public_photo_url text;
    ALTER TABLE doctor_profiles ADD CONSTRAINT doctor_public_photo_https
      CHECK (public_photo_url IS NULL OR public_photo_url ~ '^https://');
    ALTER TABLE doctor_verification_artifacts ADD COLUMN original_filename text NOT NULL DEFAULT 'verification-document';
    ALTER TABLE doctor_verification_artifacts ADD CONSTRAINT verification_filename_safe
      CHECK (original_filename = regexp_replace(original_filename, '[\\/]', '', 'g') AND length(original_filename) BETWEEN 1 AND 180);

    CREATE VIEW public_verified_doctors AS
      SELECT u.id, dp.display_name, dp.biography, dp.qualifications, dp.years_experience, dp.public_photo_url,
        array_remove(array_agg(DISTINCT s.name), NULL) specialties,
        array_remove(array_agg(DISTINCT l.name), NULL) languages
      FROM users u JOIN doctor_profiles dp ON dp.user_id=u.id
      LEFT JOIN doctor_specialties ds ON ds.doctor_id=dp.user_id LEFT JOIN specialties s ON s.id=ds.specialty_id AND s.active
      LEFT JOIN doctor_languages dl ON dl.doctor_id=dp.user_id LEFT JOIN languages l ON l.id=dl.language_id
      WHERE u.status='active' AND dp.verification_status='approved'
      GROUP BY u.id,dp.display_name,dp.biography,dp.qualifications,dp.years_experience,dp.public_photo_url;
  `);
};

exports.down = (pgm) => {
  pgm.dropView('public_verified_doctors');
  pgm.dropConstraint('doctor_verification_artifacts', 'verification_filename_safe');
  pgm.dropColumn('doctor_verification_artifacts', 'original_filename');
  pgm.dropConstraint('doctor_profiles', 'doctor_public_photo_https');
  pgm.dropColumn('doctor_profiles', 'public_photo_url');
};
