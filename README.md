# La Foulée Auvergnate

Calendrier participatif de trails et courses sur route des départements 03, 15, 43 et 63, avec une veille de sources publiques et une validation humaine avant publication.

## Veille automatique

La veille se lance automatiquement une fois par jour à la première visite du site ; le bouton **Lancer la veille** permet aussi un lancement manuel. Le robot consulte les calendriers publics de Sas de Départ (trail et route), lit leurs événements structurés, géolocalise les communes avec le service de géocodage public de la Géoplateforme de l’IGN, puis range les pistes auvergnates dans la boîte **À vérifier**. Une découverte ne rejoint pas le calendrier public sans action d’un visiteur. Un délai global de cinq minutes entre deux scans protège les sources.

Le calendrier FFA est proposé sous forme de liens de consultation par département. Son site indique qu’il n’autorise pas la copie des données affichées ; le robot ne le récupère donc pas.

La veille n’est pas un catalogue absolument exhaustif : elle dépend des calendriers publics et des comptes auxquels les API officielles donnent accès. Les organisateurs peuvent toujours proposer une course manquante depuis le formulaire du site.

## Connecter Facebook et Instagram (facultatif)

Le robot n’aspire pas les comptes privés et ne contourne pas les protections des plateformes. Il peut lire les fils des Pages Facebook et comptes Instagram professionnels auxquels une application Meta dispose légalement d’un accès. **Les identifiants et jetons doivent être définis dans l’environnement serveur de l’hébergeur, jamais dans le code ni dans un fichier `.env` publié.**

Variables facultatives :

```text
META_ACCESS_TOKEN=<jeton serveur fourni par Meta>
META_FACEBOOK_PAGE_IDS=<id_page_1,id_page_2>
META_INSTAGRAM_USER_IDS=<id_compte_pro_1,id_compte_pro_2>
META_GRAPH_API_VERSION=v26.0
```

- Pour Facebook, utiliser un jeton et des permissions permettant de lire les Pages gérées. La lecture de Pages que l’application ne gère pas peut exiger l’accès **Page Public Content Access**, une revue et l’approbation de Meta.
- Pour Instagram, utiliser l’API officielle avec un compte professionnel **Business** ou **Creator** et les permissions Meta correspondantes. L’API n’est pas un moyen de parcourir arbitrairement les comptes personnels.
- Le robot analyse seulement les publications renvoyées par ces API, puis les présente comme des pistes à vérifier.

En l’absence de ces variables, la veille des calendriers publics continue de fonctionner ; l’interface signale simplement que les connecteurs Meta ne sont pas configurés.
