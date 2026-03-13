<?php
/**
 * Plugin Name: TOIN SEO Agent
 * Plugin URI:  https://criatoin.com.br
 * Description: Conector REST API para o sistema TOIN SEO Agent. Sem interface de usuário.
 * Version:     1.0.0
 * Author:      TOIN
 * Requires at least: 5.6
 * Requires PHP: 8.0
 * License:     GPL v2 or later
 */

defined('ABSPATH') || exit;

define('TOIN_SEO_VERSION', '1.0.0');
define('TOIN_SEO_PATH', plugin_dir_path(__FILE__));

require_once TOIN_SEO_PATH . 'includes/class-auth.php';
require_once TOIN_SEO_PATH . 'includes/class-seo-plugins.php';
require_once TOIN_SEO_PATH . 'includes/class-schema.php';
require_once TOIN_SEO_PATH . 'includes/class-rest-api.php';

add_action('rest_api_init', function () {
    $api = new TOIN_SEO_REST_API();
    $api->register_routes();
});
