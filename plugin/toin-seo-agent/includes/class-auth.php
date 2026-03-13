<?php
defined('ABSPATH') || exit;

class TOIN_SEO_Auth {
    /**
     * Permission callback for all REST routes.
     * WP Application Passwords handles Basic Auth natively since WP 5.6.
     * We just verify the authenticated user has edit_posts capability.
     */
    public static function permission_callback(): bool {
        return is_user_logged_in() && current_user_can('edit_posts');
    }
}
