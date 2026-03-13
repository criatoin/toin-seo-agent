<?php
defined('ABSPATH') || exit;

class TOIN_SEO_Plugins {

    public static function detect(): string {
        if (defined('WPSEO_VERSION'))        return 'yoast';
        if (defined('RANK_MATH_VERSION'))    return 'rankmath';
        if (defined('AIOSEO_VERSION'))       return 'aioseo';
        if (defined('SEOPRESS_VERSION'))     return 'seopress';
        return 'none';
    }

    public static function get_meta(int $post_id): array {
        return match (self::detect()) {
            'yoast'    => [
                'title'       => (string) get_post_meta($post_id, '_yoast_wpseo_title', true),
                'description' => (string) get_post_meta($post_id, '_yoast_wpseo_metadesc', true),
            ],
            'rankmath' => [
                'title'       => (string) get_post_meta($post_id, 'rank_math_title', true),
                'description' => (string) get_post_meta($post_id, 'rank_math_description', true),
            ],
            'aioseo'   => [
                'title'       => (string) get_post_meta($post_id, '_aioseo_title', true),
                'description' => (string) get_post_meta($post_id, '_aioseo_description', true),
            ],
            'seopress' => [
                'title'       => (string) get_post_meta($post_id, '_seopress_titles_title', true),
                'description' => (string) get_post_meta($post_id, '_seopress_titles_desc', true),
            ],
            default    => ['title' => '', 'description' => ''],
        };
    }

    /**
     * Meta key map per plugin.
     * Returns [title_key, description_key] or null if plugin unknown.
     */
    private static function meta_keys(string $plugin): ?array {
        return match ($plugin) {
            'yoast'    => ['_yoast_wpseo_title',    '_yoast_wpseo_metadesc'],
            'rankmath' => ['rank_math_title',         'rank_math_description'],
            'aioseo'   => ['_aioseo_title',           '_aioseo_description'],
            'seopress' => ['_seopress_titles_title',  '_seopress_titles_desc'],
            default    => null,
        };
    }

    public static function set_meta(int $post_id, string $plugin, ?string $title, ?string $description): array {
        $updated = [];
        $keys = self::meta_keys($plugin);

        if ($keys === null) {
            // Fallback: no SEO plugin — nothing to write (wp_head filter handled by schema class)
            return $updated;
        }

        [$title_key, $desc_key] = $keys;

        if ($title !== null) {
            update_post_meta($post_id, $title_key, sanitize_text_field($title));
            $updated[] = 'title';
        }
        if ($description !== null) {
            update_post_meta($post_id, $desc_key, sanitize_textarea_field($description));
            $updated[] = 'description';
        }

        return $updated;
    }
}
