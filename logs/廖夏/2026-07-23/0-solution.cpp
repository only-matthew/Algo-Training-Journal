for (int a = 1; a <= n && a <= m; a++){
        squ += (n - a + 1)*(m - a + 1);
    }
    rec += n*(n+1)*m*(m+1)/4 - squ;
    cout << squ << " " << rec;


    for (int a = 1; a <= n; a++){
        for (int b = 1; b <= m; b++){
            if (a == b) squ += (n - a + 1) * (m - b + 1);\
            else rec += (n - a + 1) * (m - b + 1);
        }
    }
    cout << squ << " " << rec;

    for (ll i = 0; i <= n; i++){
        for (ll j = 0; j <= m; j++){
            ll temp = min(n - i, m- j);
            squ += temp;
            rec += (n - i)*(m - j) - temp;
        }
    }
    cout << squ << " " << rec;

    for (ll i = 0; i <= n; i++){
        for (ll j = 0; j <= m; j++){
            ll temp = min(i, j) + min(j, n - i) + min(m - j, n - i) + min(i, m - j);
            squ += temp;
            rec += n*m - temp;
        }
    }
    cout << squ/4 << " " << rec/4;