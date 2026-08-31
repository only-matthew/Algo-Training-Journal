AC代码：
#include<iostream>
#include<algorithm>
using namespace std;
int a[10010],b[10010];
int main()
{
    int n;cin>>n;
    for(int i=1;i<=n;i++)cin>>a[i];
    sort(a+1,a+n+1);
    int p=1,q=1,posi=0;
    int ans=0;
    for(int i=1;i<n;i++)
    {
        int x,y;
        if(p<=n&&(q>posi||a[p]<b[q])){
            x=a[p];
            p++;
        }
        else{
            x=b[q];
            q++;
        }
        if(p<=n&&(q>posi||a[p]<b[q])){
            y=a[p];
            p++;
        }
        else{
            y=b[q];
            q++;
        }
        posi++;
        b[posi]=x+y;
        ans+=b[posi];
    }
    cout<<ans<<endl;
    return 0;
}