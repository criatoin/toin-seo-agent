<?php
defined('ABSPATH') || exit;

class TOIN_SEO_Schema {

    const META_KEY = '_toin_seo_schema';

    public static function get(int $post_id): ?array {
        $val = get_post_meta($post_id, self::META_KEY, true);
        if (!$val) return null;
        $decoded = json_decode($val, true);
        return is_array($decoded) ? $decoded : null;
    }

    public static function set(int $post_id, array $schema): void {
        update_post_meta($post_id, self::META_KEY, wp_json_encode($schema, JSON_UNESCAPED_UNICODE));
    }

    public static function inject(): void {
        if (!is_singular()) return;
        $post_id = get_the_ID();
        if (!$post_id) return;
        $schema = self::get($post_id);
        if ($schema) {
            echo '<script type="application/ld+json">'
                . wp_json_encode($schema, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
                . '</script>' . "\n";
        }
    }
}

add_action('wp_head', ['TOIN_SEO_Schema', 'inject'], 5);
