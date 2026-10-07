"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CURATED_SOURCES = void 0;
exports.flattenSources = flattenSources;
exports.CURATED_SOURCES = [
    // ─────────────────────── Programming languages — official docs ───────────────────────
    {
        topic: 'Python official docs',
        urls: [
            'https://docs.python.org/3/tutorial/index.html',
            'https://docs.python.org/3/tutorial/controlflow.html',
            'https://docs.python.org/3/tutorial/datastructures.html',
            'https://docs.python.org/3/tutorial/modules.html',
            'https://docs.python.org/3/tutorial/classes.html',
            'https://docs.python.org/3/tutorial/errors.html',
            'https://docs.python.org/3/tutorial/stdlib.html',
            'https://docs.python.org/3/howto/functional.html',
            'https://docs.python.org/3/howto/descriptor.html',
            'https://docs.python.org/3/library/asyncio-task.html',
            'https://docs.python.org/3/library/typing.html',
            'https://docs.python.org/3/reference/datamodel.html',
        ],
    },
    {
        topic: 'JavaScript MDN',
        urls: [
            'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Introduction',
            'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Grammar_and_types',
            'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Control_flow_and_error_handling',
            'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions',
            'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Working_with_objects',
            'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_classes',
            'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Iterators_and_generators',
            'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises',
            'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules',
            'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Closures',
            'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise',
            'https://developer.mozilla.org/en-US/docs/Web/JavaScript/EventLoop',
        ],
    },
    {
        topic: 'TypeScript handbook',
        urls: [
            'https://www.typescriptlang.org/docs/handbook/2/basic-types.html',
            'https://www.typescriptlang.org/docs/handbook/2/everyday-types.html',
            'https://www.typescriptlang.org/docs/handbook/2/narrowing.html',
            'https://www.typescriptlang.org/docs/handbook/2/functions.html',
            'https://www.typescriptlang.org/docs/handbook/2/objects.html',
            'https://www.typescriptlang.org/docs/handbook/2/generics.html',
            'https://www.typescriptlang.org/docs/handbook/2/keyof-types.html',
            'https://www.typescriptlang.org/docs/handbook/2/typeof-types.html',
            'https://www.typescriptlang.org/docs/handbook/2/conditional-types.html',
            'https://www.typescriptlang.org/docs/handbook/utility-types.html',
            'https://www.typescriptlang.org/docs/handbook/2/modules.html',
        ],
    },
    {
        topic: 'Java tutorials',
        urls: [
            'https://dev.java/learn/getting-started/',
            'https://dev.java/learn/language-basics/',
            'https://dev.java/learn/classes-objects/',
            'https://dev.java/learn/inheritance/',
            'https://dev.java/learn/generics/',
            'https://dev.java/learn/exceptions/',
            'https://dev.java/learn/concurrency/',
            'https://dev.java/learn/collections-framework/',
        ],
    },
    {
        topic: 'C language reference',
        urls: [
            'https://en.cppreference.com/w/c/language',
            'https://en.cppreference.com/w/c/types',
            'https://en.cppreference.com/w/c/memory',
            'https://en.cppreference.com/w/c/io',
            'https://en.cppreference.com/w/c/string',
        ],
    },
    {
        topic: 'C++ reference',
        urls: [
            'https://en.cppreference.com/w/cpp/language/basic_concepts',
            'https://en.cppreference.com/w/cpp/language/classes',
            'https://en.cppreference.com/w/cpp/language/templates',
            'https://en.cppreference.com/w/cpp/language/exceptions',
            'https://en.cppreference.com/w/cpp/language/move_constructor',
            'https://en.cppreference.com/w/cpp/memory',
            'https://en.cppreference.com/w/cpp/thread',
        ],
    },
    {
        topic: 'C# documentation',
        urls: [
            'https://learn.microsoft.com/en-us/dotnet/csharp/tour-of-csharp/',
            'https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/types/',
            'https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/object-oriented/',
            'https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/concepts/async/',
            'https://learn.microsoft.com/en-us/dotnet/csharp/linq/',
            'https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/',
        ],
    },
    {
        topic: '.NET fundamentals',
        urls: [
            'https://learn.microsoft.com/en-us/dotnet/fundamentals/runtime-libraries/',
            'https://learn.microsoft.com/en-us/dotnet/standard/clr',
            'https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/',
            'https://learn.microsoft.com/en-us/dotnet/standard/threading/',
        ],
    },
    {
        topic: 'Dart language',
        urls: [
            'https://dart.dev/language',
            'https://dart.dev/language/variables',
            'https://dart.dev/language/functions',
            'https://dart.dev/language/classes',
            'https://dart.dev/language/async',
            'https://dart.dev/language/isolates',
            'https://dart.dev/effective-dart/style',
        ],
    },
    {
        topic: 'Flutter framework',
        urls: [
            'https://docs.flutter.dev/get-started/codelab',
            'https://docs.flutter.dev/ui/widgets-intro',
            'https://docs.flutter.dev/data-and-backend/state-mgmt/intro',
            'https://docs.flutter.dev/perf/best-practices',
            'https://docs.flutter.dev/cookbook',
        ],
    },
    {
        topic: 'Go documentation',
        urls: [
            'https://go.dev/doc/effective_go',
            'https://go.dev/doc/tutorial/getting-started',
            'https://go.dev/doc/tutorial/create-module',
            'https://go.dev/doc/tutorial/generics',
            'https://go.dev/doc/faq',
            'https://go.dev/ref/spec',
            'https://go.dev/blog/concurrency-is-not-parallelism',
            'https://go.dev/blog/error-handling-and-go',
        ],
    },
    {
        topic: 'Rust book',
        urls: [
            'https://doc.rust-lang.org/book/ch01-00-getting-started.html',
            'https://doc.rust-lang.org/book/ch03-00-common-programming-concepts.html',
            'https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html',
            'https://doc.rust-lang.org/book/ch05-00-structs.html',
            'https://doc.rust-lang.org/book/ch06-00-enums.html',
            'https://doc.rust-lang.org/book/ch09-00-error-handling.html',
            'https://doc.rust-lang.org/book/ch10-00-generics.html',
            'https://doc.rust-lang.org/book/ch13-00-functional-features.html',
            'https://doc.rust-lang.org/book/ch15-00-smart-pointers.html',
            'https://doc.rust-lang.org/book/ch16-00-concurrency.html',
            'https://doc.rust-lang.org/book/ch19-00-advanced-features.html',
        ],
    },
    {
        topic: 'PHP manual',
        urls: [
            'https://www.php.net/manual/en/language.basic-syntax.php',
            'https://www.php.net/manual/en/language.types.php',
            'https://www.php.net/manual/en/language.control-structures.php',
            'https://www.php.net/manual/en/language.functions.php',
            'https://www.php.net/manual/en/language.oop5.php',
            'https://www.php.net/manual/en/language.exceptions.php',
        ],
    },
    {
        topic: 'Ruby documentation',
        urls: [
            'https://www.ruby-lang.org/en/documentation/quickstart/',
            'https://www.ruby-lang.org/en/documentation/quickstart/2/',
            'https://www.ruby-lang.org/en/documentation/quickstart/3/',
            'https://www.ruby-lang.org/en/documentation/quickstart/4/',
            'https://docs.ruby-lang.org/en/master/syntax_rdoc.html',
        ],
    },
    {
        topic: 'Ruby on Rails',
        urls: [
            'https://guides.rubyonrails.org/getting_started.html',
            'https://guides.rubyonrails.org/active_record_basics.html',
            'https://guides.rubyonrails.org/action_controller_overview.html',
            'https://guides.rubyonrails.org/active_record_querying.html',
            'https://guides.rubyonrails.org/security.html',
        ],
    },
    {
        topic: 'Swift book',
        urls: [
            'https://docs.swift.org/swift-book/documentation/the-swift-programming-language/thebasics',
            'https://docs.swift.org/swift-book/documentation/the-swift-programming-language/controlflow',
            'https://docs.swift.org/swift-book/documentation/the-swift-programming-language/functions',
            'https://docs.swift.org/swift-book/documentation/the-swift-programming-language/closures',
            'https://docs.swift.org/swift-book/documentation/the-swift-programming-language/classesandstructures',
            'https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency',
        ],
    },
    {
        topic: 'Kotlin docs',
        urls: [
            'https://kotlinlang.org/docs/basic-syntax.html',
            'https://kotlinlang.org/docs/idioms.html',
            'https://kotlinlang.org/docs/coding-conventions.html',
            'https://kotlinlang.org/docs/classes.html',
            'https://kotlinlang.org/docs/functions.html',
            'https://kotlinlang.org/docs/coroutines-overview.html',
            'https://kotlinlang.org/docs/flow.html',
        ],
    },
    {
        topic: 'Scala docs',
        urls: [
            'https://docs.scala-lang.org/tour/tour-of-scala.html',
            'https://docs.scala-lang.org/tour/classes.html',
            'https://docs.scala-lang.org/tour/traits.html',
            'https://docs.scala-lang.org/tour/pattern-matching.html',
            'https://docs.scala-lang.org/tour/implicit-parameters.html',
        ],
    },
    {
        topic: 'Haskell tutorial',
        urls: [
            'https://www.haskell.org/tutorial/haskell-98-tutorial.pdf',
            'https://wiki.haskell.org/Introduction',
            'https://wiki.haskell.org/Type',
            'https://wiki.haskell.org/Monad',
        ],
    },
    {
        topic: 'Elixir getting started',
        urls: [
            'https://elixir-lang.org/getting-started/introduction.html',
            'https://elixir-lang.org/getting-started/basic-types.html',
            'https://elixir-lang.org/getting-started/pattern-matching.html',
            'https://elixir-lang.org/getting-started/modules-and-functions.html',
            'https://elixir-lang.org/getting-started/processes.html',
        ],
    },
    {
        topic: 'Erlang docs',
        urls: [
            'https://www.erlang.org/doc/getting_started/intro.html',
            'https://www.erlang.org/doc/getting_started/seq_prog.html',
            'https://www.erlang.org/doc/getting_started/conc_prog.html',
            'https://www.erlang.org/doc/getting_started/robustness.html',
        ],
    },
    {
        topic: 'Clojure guides',
        urls: [
            'https://clojure.org/guides/learn/syntax',
            'https://clojure.org/guides/learn/functions',
            'https://clojure.org/guides/learn/sequential_colls',
            'https://clojure.org/reference/concurrency',
        ],
    },
    {
        topic: 'R manuals',
        urls: [
            'https://cran.r-project.org/doc/manuals/r-release/R-intro.html',
            'https://cran.r-project.org/doc/manuals/r-release/R-lang.html',
        ],
    },
    {
        topic: 'Julia docs',
        urls: [
            'https://docs.julialang.org/en/v1/manual/getting-started/',
            'https://docs.julialang.org/en/v1/manual/variables/',
            'https://docs.julialang.org/en/v1/manual/types/',
            'https://docs.julialang.org/en/v1/manual/methods/',
            'https://docs.julialang.org/en/v1/manual/parallel-computing/',
        ],
    },
    {
        topic: 'Perl docs',
        urls: [
            'https://perldoc.perl.org/perlintro',
            'https://perldoc.perl.org/perlsyn',
            'https://perldoc.perl.org/perldata',
            'https://perldoc.perl.org/perlsub',
            'https://perldoc.perl.org/perlre',
        ],
    },
    {
        topic: 'Lua manual',
        urls: [
            'https://www.lua.org/manual/5.4/manual.html',
            'https://www.lua.org/pil/contents.html',
        ],
    },
    {
        topic: 'Crystal docs',
        urls: [
            'https://crystal-lang.org/reference/1.10/syntax_and_semantics/index.html',
            'https://crystal-lang.org/reference/1.10/syntax_and_semantics/types_and_methods.html',
        ],
    },
    {
        topic: 'Nim docs',
        urls: [
            'https://nim-lang.org/docs/tut1.html',
            'https://nim-lang.org/docs/tut2.html',
            'https://nim-lang.org/docs/manual.html',
        ],
    },
    {
        topic: 'Zig language',
        urls: [
            'https://ziglang.org/learn/overview/',
            'https://ziglang.org/learn/why_zig_rust_d_cpp/',
            'https://ziglang.org/documentation/master/',
        ],
    },
    {
        topic: 'PowerShell',
        urls: [
            'https://learn.microsoft.com/en-us/powershell/scripting/overview',
            'https://learn.microsoft.com/en-us/powershell/scripting/learn/ps101/00-introduction',
            'https://learn.microsoft.com/en-us/powershell/scripting/learn/deep-dives/everything-about-arrays',
            'https://learn.microsoft.com/en-us/powershell/scripting/learn/deep-dives/everything-about-hashtable',
        ],
    },
    {
        topic: 'Bash manual',
        urls: [
            'https://www.gnu.org/software/bash/manual/html_node/index.html',
            'https://www.gnu.org/software/bash/manual/html_node/Shell-Builtin-Commands.html',
            'https://www.gnu.org/software/bash/manual/html_node/Bash-Variables.html',
        ],
    },
    {
        topic: 'F# documentation',
        urls: [
            'https://learn.microsoft.com/en-us/dotnet/fsharp/tour',
            'https://learn.microsoft.com/en-us/dotnet/fsharp/introduction-to-functional-programming/',
            'https://learn.microsoft.com/en-us/dotnet/fsharp/language-reference/discriminated-unions',
        ],
    },
    {
        topic: 'OCaml tutorials',
        urls: [
            'https://ocaml.org/docs/tour-of-ocaml',
            'https://ocaml.org/docs/values-and-functions',
            'https://ocaml.org/docs/lists',
            'https://ocaml.org/docs/modules',
        ],
    },
    {
        topic: 'Racket guide',
        urls: [
            'https://docs.racket-lang.org/guide/intro.html',
            'https://docs.racket-lang.org/guide/syntax-overview.html',
            'https://docs.racket-lang.org/guide/contracts.html',
        ],
    },
    {
        topic: 'Solidity',
        urls: [
            'https://docs.soliditylang.org/en/latest/introduction-to-smart-contracts.html',
            'https://docs.soliditylang.org/en/latest/structure-of-a-contract.html',
            'https://docs.soliditylang.org/en/latest/types.html',
            'https://docs.soliditylang.org/en/latest/security-considerations.html',
        ],
    },
    {
        topic: 'WebAssembly',
        urls: [
            'https://webassembly.org/docs/high-level-goals/',
            'https://developer.mozilla.org/en-US/docs/WebAssembly/Concepts',
            'https://developer.mozilla.org/en-US/docs/WebAssembly/Understanding_the_text_format',
        ],
    },
    // ─────────────────────── Databases & data ───────────────────────
    {
        topic: 'PostgreSQL docs',
        urls: [
            'https://www.postgresql.org/docs/current/tutorial-start.html',
            'https://www.postgresql.org/docs/current/tutorial-sql-intro.html',
            'https://www.postgresql.org/docs/current/sql-select.html',
            'https://www.postgresql.org/docs/current/indexes.html',
            'https://www.postgresql.org/docs/current/transaction-iso.html',
            'https://www.postgresql.org/docs/current/performance-tips.html',
            'https://www.postgresql.org/docs/current/explicit-locking.html',
        ],
    },
    {
        topic: 'MySQL docs',
        urls: [
            'https://dev.mysql.com/doc/refman/8.0/en/tutorial.html',
            'https://dev.mysql.com/doc/refman/8.0/en/select.html',
            'https://dev.mysql.com/doc/refman/8.0/en/optimization.html',
            'https://dev.mysql.com/doc/refman/8.0/en/innodb-locking.html',
        ],
    },
    {
        topic: 'SQLite docs',
        urls: [
            'https://www.sqlite.org/lang.html',
            'https://www.sqlite.org/wal.html',
            'https://www.sqlite.org/queryplanner.html',
            'https://www.sqlite.org/fts5.html',
        ],
    },
    {
        topic: 'MongoDB docs',
        urls: [
            'https://www.mongodb.com/docs/manual/introduction/',
            'https://www.mongodb.com/docs/manual/crud/',
            'https://www.mongodb.com/docs/manual/aggregation/',
            'https://www.mongodb.com/docs/manual/indexes/',
        ],
    },
    // ─────────────────────── Web platform ───────────────────────
    {
        topic: 'HTML spec',
        urls: [
            'https://developer.mozilla.org/en-US/docs/Learn/HTML/Introduction_to_HTML/Getting_started',
            'https://developer.mozilla.org/en-US/docs/Web/HTML/Element',
            'https://developer.mozilla.org/en-US/docs/Learn/Forms/Sending_and_retrieving_form_data',
        ],
    },
    {
        topic: 'CSS reference',
        urls: [
            'https://developer.mozilla.org/en-US/docs/Web/CSS/Cascade',
            'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Flexible_Box_Layout/Basic_Concepts_of_Flexbox',
            'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Grid_Layout/Basic_Concepts_of_Grid_Layout',
            'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Containment/Container_queries',
        ],
    },
    // ─────────────────────── DevOps / containers ───────────────────────
    {
        topic: 'Docker docs',
        urls: [
            'https://docs.docker.com/get-started/overview/',
            'https://docs.docker.com/build/concepts/dockerfile/',
            'https://docs.docker.com/build/building/best-practices/',
            'https://docs.docker.com/compose/intro/features-uses/',
            'https://docs.docker.com/engine/network/',
        ],
    },
    {
        topic: 'Kubernetes docs',
        urls: [
            'https://kubernetes.io/docs/concepts/overview/',
            'https://kubernetes.io/docs/concepts/workloads/pods/',
            'https://kubernetes.io/docs/concepts/workloads/controllers/deployment/',
            'https://kubernetes.io/docs/concepts/services-networking/service/',
            'https://kubernetes.io/docs/concepts/security/rbac-good-practices/',
            'https://kubernetes.io/docs/concepts/security/pod-security-standards/',
        ],
    },
    // ─────────────────────── Cybersecurity — free official sources ───────────────────────
    {
        topic: 'OWASP Top 10 (2021)',
        urls: [
            'https://owasp.org/Top10/A01_2021-Broken_Access_Control/',
            'https://owasp.org/Top10/A02_2021-Cryptographic_Failures/',
            'https://owasp.org/Top10/A03_2021-Injection/',
            'https://owasp.org/Top10/A04_2021-Insecure_Design/',
            'https://owasp.org/Top10/A05_2021-Security_Misconfiguration/',
            'https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/',
            'https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/',
            'https://owasp.org/Top10/A08_2021-Software_and_Data_Integrity_Failures/',
            'https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/',
            'https://owasp.org/Top10/A10_2021-Server-Side_Request_Forgery_%28SSRF%29/',
        ],
    },
    {
        topic: 'OWASP cheatsheets',
        urls: [
            'https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html',
            'https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html',
            'https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html',
            'https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html',
            'https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html',
            'https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html',
            'https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html',
            'https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html',
            'https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html',
            'https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html',
            'https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Security_Response_Headers_Cheat_Sheet.html',
            'https://cheatsheetseries.owasp.org/cheatsheets/Secure_Cloud_Architecture_Cheat_Sheet.html',
            'https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html',
            'https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html',
            'https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html',
        ],
    },
    {
        topic: 'OWASP API Security Top 10',
        urls: [
            'https://owasp.org/API-Security/editions/2023/en/0x11-t10/',
            'https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/',
            'https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/',
            'https://owasp.org/API-Security/editions/2023/en/0xa3-broken-object-property-level-authorization/',
            'https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/',
        ],
    },
    {
        topic: 'OWASP ASVS',
        urls: [
            'https://owasp.org/www-project-application-security-verification-standard/',
        ],
    },
    {
        topic: 'NIST CSF and 800-series',
        urls: [
            'https://csrc.nist.gov/projects/cybersecurity-framework',
            'https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final',
            'https://csrc.nist.gov/pubs/sp/800/63/3/final',
            'https://csrc.nist.gov/pubs/sp/800/218/final',
            'https://csrc.nist.gov/pubs/sp/800/207/final',
            'https://csrc.nist.gov/pubs/sp/800/61/r2/final',
        ],
    },
    {
        topic: 'SANS Reading Room (free whitepapers)',
        urls: [
            'https://www.sans.org/white-papers/40010/',
            'https://www.sans.org/white-papers/40130/',
            'https://www.sans.org/blog/',
        ],
    },
    {
        topic: 'CWE software weaknesses',
        urls: [
            'https://cwe.mitre.org/top25/archive/2024/2024_cwe_top25.html',
            'https://cwe.mitre.org/data/definitions/79.html',
            'https://cwe.mitre.org/data/definitions/89.html',
            'https://cwe.mitre.org/data/definitions/787.html',
            'https://cwe.mitre.org/data/definitions/352.html',
        ],
    },
    {
        topic: 'MITRE ATT&CK',
        urls: [
            'https://attack.mitre.org/',
            'https://attack.mitre.org/tactics/enterprise/',
            'https://attack.mitre.org/mitigations/enterprise/',
        ],
    },
    {
        topic: 'NCA Saudi cybersecurity (English)',
        urls: [
            'https://nca.gov.sa/en/regulatory-documents/controls-list/',
        ],
    },
    {
        topic: 'PortSwigger Web Security Academy',
        urls: [
            'https://portswigger.net/web-security/learning-path',
            'https://portswigger.net/web-security/sql-injection',
            'https://portswigger.net/web-security/cross-site-scripting',
            'https://portswigger.net/web-security/csrf',
            'https://portswigger.net/web-security/access-control',
            'https://portswigger.net/web-security/authentication',
            'https://portswigger.net/web-security/file-upload',
            'https://portswigger.net/web-security/ssrf',
            'https://portswigger.net/web-security/xxe',
            'https://portswigger.net/web-security/jwt',
            'https://portswigger.net/web-security/api-testing',
        ],
    },
    // ─────────────────────── AI / ML ───────────────────────
    {
        topic: 'PyTorch tutorials',
        urls: [
            'https://pytorch.org/tutorials/beginner/basics/intro.html',
            'https://pytorch.org/tutorials/beginner/basics/tensorqs_tutorial.html',
            'https://pytorch.org/tutorials/beginner/basics/autogradqs_tutorial.html',
            'https://pytorch.org/tutorials/beginner/basics/optimization_tutorial.html',
        ],
    },
];
function flattenSources() {
    return exports.CURATED_SOURCES.flatMap((s) => s.urls.map((url) => ({ topic: s.topic, url })));
}
//# sourceMappingURL=sources.js.map